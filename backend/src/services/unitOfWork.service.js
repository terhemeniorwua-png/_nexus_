"use strict";

/**
 * Phase 12 — multi-document writes without pretending Mongo always supports
 * them.
 *
 * Approving a deliverable touches four records (version, review, deliverable,
 * task). The requirement is all-or-nothing, so this helper has two paths:
 *
 *   1. `runTransactionally` — a real MongoDB transaction, used when the
 *      deployment is a replica set (Mongo only offers multi-document
 *      transactions there). The driver retries transient errors.
 *
 *   2. `runWithCompensation` — used on a standalone mongod, where transactions
 *      do not exist. Each step registers an undo action; if a later step
 *      throws, the undo actions run in reverse and the database is left in its
 *      original state. The caller keeps using the same code either way.
 *
 * The optimistic guards in the deliverable service (compare-and-set on the
 * version status, unique index on the version number) are what make the
 * fallback safe against *concurrent* writers: two approvals race on the same
 * `status` filter and the loser changes nothing, so there is nothing to roll
 * back. Compensation covers failure, the guard covers concurrency.
 */

let transactionsSupported;

async function detectTransactionSupport() {
  if (transactionsSupported !== undefined) return transactionsSupported;
  try {
    const mongoose = require("mongoose");
    if (mongoose.connection.readyState !== 1) {
      transactionsSupported = false;
      return transactionsSupported;
    }
    const info = await mongoose.connection.db.admin().command({ hello: 1 });
    // A replica set or sharded cluster is required for transactions.
    transactionsSupported = Boolean(info.setName || info.msg === "isdbgrid");
  } catch {
    transactionsSupported = false;
  }
  return transactionsSupported;
}

async function runTransactionally(work) {
  const mongoose = require("mongoose");
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function runWithCompensation(work) {
  const undo = [];
  try {
    return await work({
      registerUndo: (fn) => undo.push(fn),
      supportsTransactions: false,
    });
  } catch (error) {
    // Unwind in reverse order. A failing undo is logged rather than thrown:
    // the original error is the one the user should see, and every step's
    // undo is written to be independently safe.
    for (const step of [...undo].reverse()) {
      try {
        await step();
      } catch (undoError) {
        console.error("[nexus] rollback step failed:", undoError);
      }
    }
    throw error;
  }
}

/**
 * Run `work` atomically. `work({ session, registerUndo, supportsTransactions })`
 * must pass `session` to every query when it is present, and register an undo
 * action for every write it performs.
 */
async function runAtomically(work) {
  if (await detectTransactionSupport()) {
    try {
      return await runTransactionally((session) => work({ session, supportsTransactions: true }));
    } catch (error) {
      // A deployment that claims replica-set support but refuses the
      // transaction (e.g. an unsharded standalone started with --replSet but
      // no primary) should not take the whole feature down.
      if (
        error &&
        typeof error.message === "string" &&
        /Transaction numbers are only allowed|replica set|mongos/i.test(error.message)
      ) {
        transactionsSupported = false;
        return runWithCompensation(work);
      }
      throw error;
    }
  }
  return runWithCompensation(work);
}

module.exports = {
  detectTransactionSupport,
  runAtomically,
  runTransactionally,
  runWithCompensation,
};
