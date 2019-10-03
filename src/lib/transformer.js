const through = require('through2');

const transformer = {
  dataFiles: {},
  steps: [],
  addDataFile(relPath, data) {
    this.dataFiles[relPath] = data;
  },
};

/*
-------------------------------------------------------------------------------
*/

// Parse a directive <file> <key> into a YAML data object in file[id: key].
function getDataFile(directive) {
  const matches = directive.match(/(\S+)/g);
  if (matches === null) return null;

  const file = transformer.dataFiles[matches[0]];
  if (file === undefined) {
    console.log(`No such file ${matches[0]}.`);
    return null;
  }

  // Get the table YAML document matching the key, or the first if no key.
  const doc = file.find(d => d.id === matches[1]);
  if (doc === undefined) {
    console.log(`No such table ${matches[1]} in file ${matches[0]}.`);
    return null;
  }

  return [doc, matches];
}

function generateTableBody(data, rows, columns) {
  const extra = data.length % columns;
  const totalRows = extra ? rows + 1 : rows;

  let body = '';

  // Stack table entries side-by-side.
  for (let row = 0; row < totalRows; row += 1) {
    let rowText = '| ';
    for (let column = 0; column < columns; column += 1) {
      const idx = row + Math.min(column, extra) + (column * rows);
      if (idx >= data.length) break;
      rowText += (column ? ' | ' : '') + data[idx];
    }
    body += `${rowText} |\n`;
  }

  return body;
}

function assembleTable(doc) {
  // Convert it into markdown, optionally combining multiple columns.

  const columns = doc.columns || 1;
  const rows = Math.floor(doc.data.length / columns);

  let header = '';
  doc.header.forEach((h) => {
    header += `| ${`${h} | `.repeat(columns - 1)}${h} |\n`;
  });

  return `\n${header}${generateTableBody(doc.data, rows, columns)}\n`;
}

// Transform markdown document by parsing and including data tables.
function preProcessMd(data) {
  // Scan for HTML comments with a directive, e.g. <!-- $data -->.
  const regex = /<!--\s*\$(\S+)\s*([\S\s]*?)\s*-->/g;

  function matchReplace(match, name, extraData) {
    const step = transformer.steps.find(d => (name === d.key)
      || (d.allowExtra && name.startsWith(d.key)));
    return (data && step.replace(extraData, name)) || '';
  }

  return data.replace(regex, matchReplace);
}

/*
TODO: move this to separate files (make more extensible).
-------------------------------------------------------------------------------
*/

transformer.steps.push({
  key: 'data',
  // Parse the directive: $data <file> <key>
  replace: (directive) => {
    const file = getDataFile(directive);
    if (file === null) return '';
    const [doc, matches] = file;

    const out = assembleTable(doc);
    if (matches.length > 2) {
      return `<div class="${matches.slice(2).join(' ')}">\n${out}\n</div>`;
    }

    return out;
  },
});

function replaceHeader(extraData, keep) {
  return keep ? `![title-img](${transformer.config.imgUrl})\n<h1 class="title"> ${transformer.config.headerText} ${extraData} </h1>` : '';
}

transformer.steps.push({
  key: 'header',
  allowExtra: 'true',
  replace: (data, name) => replaceHeader(data, name === 'header-main' ? true : transformer.config.includeHeaders),
});

transformer.steps.push({
  key: 'page-break',
  replace: () => '<div class="page-break-after"></div>',
});

/*
--------------------------------------------------------------------------------
*/

transformer.init = (config) => {
  transformer.config = config;
};

transformer.process = preProcessMd;

transformer.stream = (config) => {
  transformer.config = config;

  /* eslint-disable no-param-reassign */
  return through.obj((file, enc, cb) => {
    file.contents = Buffer.from(transformer.process(file.contents.toString()));
    cb(null, file);
  });
};

module.exports = transformer;
