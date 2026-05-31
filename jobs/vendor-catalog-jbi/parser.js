const { parse } = require("csv-parse");

function createTabParser({ columns = true } = {}) {
  return parse({
    delimiter: "\t",
    columns,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    relax_quotes: true,
  });
}

module.exports = { createTabParser };
