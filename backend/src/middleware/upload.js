"use strict";

/**
 * Multipart handling for deliverable uploads.
 *
 * Kept out of the routes themselves so the size/type policy lives in exactly
 * one place (the storage service) and no other route can accidentally accept a
 * file. Multer keeps the file in memory: the limit is small, the file is
 * validated by magic bytes, and the storage service writes it once with a
 * generated key — so nothing touches a temp file with a client-chosen name.
 */

const multer = require("multer");
const { ApiError } = require("./errorHandler");
const { getMaxFileSize } = require("../services/storage.service");

function createDeliverableUpload(fieldName = "file") {
  return multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: getMaxFileSize(),
      files: 1,
      fields: 20,
      fieldSize: 8 * 1024,
    },
  }).single(fieldName);
}

/**
 * Translate multer's errors into the project's ApiError shape so a rejected
 * upload reads like every other 400 instead of a framework stack trace (§52).
 */
function handleUploadError(error, _req, _res, next) {
  if (!error) return next();

  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      const mb = (getMaxFileSize() / (1024 * 1024)).toFixed(1);
      return next(new ApiError(400, `File is too large (maximum ${mb} MB)`));
    }
    if (error.code === "LIMIT_UNEXPECTED_FILE" || error.code === "LIMIT_FILE_COUNT") {
      return next(new ApiError(400, "Attach one file, sent as the `file` field"));
    }
    return next(new ApiError(400, "Could not read the uploaded file"));
  }

  return next(error);
}

module.exports = { createDeliverableUpload, handleUploadError };
