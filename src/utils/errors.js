/**
 * Base application error - carries an HTTP status code and machine-readable code.
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

class DownloadError extends AppError {
  constructor(message, details = null) {
    super(message, 502, 'DOWNLOAD_ERROR', details);
  }
}

class CorruptedFileError extends AppError {
  constructor(message, details = null) {
    super(message, 422, 'CORRUPTED_FILE_ERROR', details);
  }
}

class FfmpegError extends AppError {
  constructor(message, details = null) {
    super(message, 500, 'FFMPEG_ERROR', details);
  }
}

class TimeoutError extends AppError {
  constructor(message, details = null) {
    super(message, 504, 'TIMEOUT_ERROR', details);
  }
}

module.exports = {
  AppError,
  ValidationError,
  DownloadError,
  CorruptedFileError,
  FfmpegError,
  TimeoutError
};
