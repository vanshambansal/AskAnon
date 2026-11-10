// Multer storage using Cloudinary's supported stream API; no deprecated adapter dependency.
export function cloudinaryStorage(cloudinary, params) {
  return {
    _handleFile(req, file, callback) {
      let finished = false;
      const done = (error, result) => { if (!finished) { finished = true; callback(error, result); } };
      Promise.resolve(typeof params === 'function' ? params(req, file) : params).then(options => {
        const upload = cloudinary.uploader.upload_stream(options, (error, result) => {
          if (error) return done(error);
          done(null, { path: result.secure_url, filename: result.public_id, size: result.bytes, resource_type: result.resource_type });
        });
        file.stream.on('error', error => { upload.destroy(); done(error); });
        upload.on('error', done);
        file.stream.pipe(upload);
      }).catch(done);
    },
    _removeFile(req, file, callback) {
      if (!file.filename) return callback(null);
      cloudinary.uploader.destroy(file.filename, { resource_type: file.resource_type || (file.mimetype === 'application/pdf' ? 'raw' : 'image') }).then(() => callback(null), callback);
    }
  };
}
