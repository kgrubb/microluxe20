const gulp = require('gulp');
const zip = require('gulp-zip');
const changed = require('gulp-changed');
const changedInPlace = require('gulp-changed-in-place');
const fs = require('fs');
const yaml = require('js-yaml');
const through = require('through2');
const remarkable = require('gulp-remarkable');
const pjson = require('./package.json');
const htmlToPdf = require('./src/lib/html-to-pdf');
const transformer = require('./src/lib/transformer');

const config = {
  dataPath: 'src/data/**/*.{yml,yaml}',
  mdPath: 'src/markdown/*.md',
  cssPath: 'src/styles/*.css',
  cssDir: 'src/styles',
  out: 'documents',
  htmlPath: 'html',
  paperFormat: 'Letter',

  compiledOut: [
    ['handbook', 'equipment', 'classes'],
    ['gm_guide'],
    ['lore'],
    ['races'],
  ],

  readme: 'README.md',
  headerText: 'Microluxe 20 <br> <br>',
  imgUrl: './src/static/logo-plain.png',
  includeHeaders: true,
};

transformer.init(config);

/*
-------------------------------------------------------------------------------
*/


// Load data when it has changed.
gulp.task('load-data', () => gulp.src(config.dataPath)
  .pipe(changedInPlace({ firstPass: true }))
  .pipe(through.obj((file, enc, cb) => {
    const data = yaml.safeLoadAll(file.contents);
    transformer.addDataFile(file.relative, data);
    cb();
  })));

const mdHtmlOpts = {
  html: true,
  breaks: true,
  typographer: true,
};

gulp.task('compile-md', () => gulp.src(config.mdPath)
  .pipe(changed(config.htmlPath), { extension: '.html' })
  // Preprocess the file's contents.
  .pipe(transformer.stream(config))
  .pipe(remarkable({ remarkableOptions: mdHtmlOpts }))
  .pipe(gulp.dest(config.htmlPath)));

const htmlToPdfOpts = {
  paperFormat: config.paperFormat,
  cssPath: config.cssDir,
  cwd: process.cwd(),
};

gulp.task('make-pdf', () => gulp.src(`${config.htmlPath}/*.html`)
  .pipe(changed(config.out, { extension: '.pdf' }))
  .pipe(htmlToPdf(htmlToPdfOpts))
  .pipe(gulp.dest(config.out)));

// compile all the documents
gulp.task('compile', gulp.series('load-data', 'compile-md', 'make-pdf'));

// Make a gulp.parallel object containing tasks to create release documents.
function makeReleaseTasks() {
  const tasks = [];
  config.compiledOut.forEach((d) => {
    const func = () => {
      let data;
      let contents;
      const files = d.length > 1 ? `{${d.join(',')}}` : d[0];
      return gulp.src(config.mdPath.replace('*', `microluxe20_${files}`))
        .pipe(through.obj(
          (file, enc, cb) => {
            if (!data) {
              data = file;
              contents = file.contents.toString();
            } else contents += `\n\n${file.contents.toString()}`;
            cb(null);
          },
          (cb) => {
            data.contents = Buffer.from(contents);
            cb(null, data);
          },
        ))
        .pipe(transformer.stream(config))
        .pipe(remarkable({ remarkableOptions: mdHtmlOpts }))
        .pipe(htmlToPdf(htmlToPdfOpts))
        .pipe(gulp.dest(config.out));
    };
    func.displayName = `compile-${d[0]}`;
    tasks.push(func);
  });
  return gulp.parallel(tasks);
}

gulp.task('clean', () => gulp.src('documents/*')
  .pipe(through.obj((file, err, cb) => {
    fs.unlinkSync(file.path);
    cb(null);
  })));

// compile documents into their assigned books.
gulp.task('compile-release', gulp.series((done) => {
  config.includeHeaders = false; done();
}, 'load-data', makeReleaseTasks()));


// create release zip from documents
gulp.task('make-release', done => fs.stat('documents', (err) => {
  if (err) {
    return console.log(err);
  }
  const release = `microluxe20_${pjson.version}.zip`;
  return gulp.src(['documents/*', 'character-sheets/*', 'map/*.png', 'LICENSE'])
    .pipe(zip(release))
    .pipe(gulp.dest('./release'), done());
}));

gulp.task('release', gulp.series('clean', 'compile-release', 'make-release'));

gulp.task('watch', () => {
  gulp.watch([config.mdPath, config.cssPath], gulp.task('compile'));
});

gulp.task('default', (cb) => {
  console.log(fs.readFileSync(config.readme, {
    encoding: 'UTF8',
  }));
  cb();
});
