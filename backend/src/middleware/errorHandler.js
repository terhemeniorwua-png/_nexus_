class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

function errorHandler(err, req, res, _next) {
  if (req.logError) {
    req.logError(err);
  }

  const statusCode = err instanceof ApiError ? err.statusCode : 500;

  if (statusCode === 500) {
    console.error("[nexus] Unhandled error:", err);
  }

  if (err.name === "MongoServerError" && err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || "field";
    const label = field === "email" ? "An account with this email already exists" : `Duplicate ${field}`;
    return res.status(409).json({ success: false, message: label });
  }

  if (err.name === "CastError") {
    return res.status(400).json({ success: false, message: "Invalid identifier" });
  }

  const message =
    statusCode === 500 ? "Something went wrong on our end. Please try again later." : err.message;

  return res.status(statusCode).json({ success: false, message });
}

module.exports = { ApiError, notFoundHandler, errorHandler };