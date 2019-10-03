// This file makes use of closure parameters, requring that we disable no-param-reassign.
/* eslint-disable no-param-reassign */

const pify = require('pify');
const fs = pify(require('fs'));
const tmp = require('tmp-promise');
const { spawn } = require('child_process');
const through = require('through2');
const path = require('path');

const html5bp = path.normalize('./src/static/html5bp.html');

function htmlConverter(options, file) {
  return (tempObject) => {
    const tmpfile = tempObject.path;
    const tmpfilePDF = path.join(path.dirname(tmpfile), `${path.basename(tmpfile, '.html')}.pdf`);
    const wkhtmlOpts = [
      '-s', options.paperFormat,
      '-L', options.hMargin, '-R', options.hMargin,
      '-T', options.vMargin, '-B', options.vMargin,
      '--log-level', 'warn',
      tmpfile, tmpfilePDF,
    ];

    return new Promise((resolve, reject) => {
      spawn('wkhtmltopdf', wkhtmlOpts, {
        cwd: options.cwd,
      }).on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`WKHtmlToPdf exited with code ${code}.`));
          return;
        }

        fs.readFile(tmpfilePDF).then((data) => {
          resolve(data);
        }, (err) => {
          reject(new Error(`Couldn't read PDF file contents: ${err}`));
        });
      });
    }).then((data) => {
      file.contents = data;
      file.extname = '.pdf';

      tempObject.cleanup();
      fs.unlink(tmpfilePDF).catch(() => {});
      return file;
    });
  };
}

module.exports = options => through.obj((file, enc, cb) => {
  if (file.isNull()) {
    cb(null, file);
    return;
  }

  if (file.isStream()) {
    cb(new Error('HTMLToPDF does not support stream-mode processing.'));
    return;
  }

  options.hMargin = options.hMargin || '2cm';
  options.vMargin = options.vMargin || '2cm';

  fs.readFile(html5bp, 'utf8')
    .catch(err => cb(`Error opening HTML boilerplate: ${err.message}`))
    .then((data) => {
      const htmlData = data
        .replace(/\{\{baseUrl\}\}/g, path.join(options.cwd, 'src/'))
        .replace('{{content}}', file.contents.toString());
      return tmp.file({ dir: options.cwd, prefix: '.tmp-', postfix: '.html' })
        .then(o => fs.writeFile(o.path, htmlData).then(() => o))
        .then(htmlConverter(options, file))
        .then(() => cb(null, file), err => cb(err));
    });
});
