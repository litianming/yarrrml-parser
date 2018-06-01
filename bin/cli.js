#!/usr/bin/env node

/**
 * author: Pieter Heyvaert (pheyvaer.heyvaert@ugent.be)
 * Ghent University - imec - IDLab
 */

const program = require('commander');
const path = require('path');
const fs = require('fs');
const Y2R = require('../lib/yarrrml2rml.js');
const Y2R2 = require('../lib/yarrrml2r2rml.js');
const r2y = require('../lib/rml2yarrrml.js');
const pkginfo = require('pkginfo');
const N3 = require('n3');
const namespaces = require('prefix-ns').asMap();
const watch = require('../lib/watcher.js');

pkginfo(module, 'version');

program.version(module.exports.version);
program.option('-i, --input <input>', 'input file');
program.option('-o, --output <output>', 'output file (default: stdout)');
program.option('-f, --format <output>', 'YAML, RML or R2RML (default: RML)');
program.option('-w, --watch', 'watch for file changes');
program.parse(process.argv);

if (!program.input) {
  console.error('Please provide an input file.');
} else {
  if (!path.isAbsolute(program.input)) {
    program.input = path.join(process.cwd(), program.input);
  }

  if (!program.watch) {
    try {
      const inputData = fs.readFileSync(program.input, 'utf8');

      if (program.format) {
        program.format = program.format.toUpperCase();
      }

      if (program.format !== 'YAML') {
        let triples;

        const prefixes = {
          rr: namespaces.rr,
          rdf: namespaces.rdf,
          rdfs: namespaces.rdfs
        };

        if (!program.format || program.format === 'RML') {
          const y2r = new Y2R();
          triples = y2r.convert(inputData);

          prefixes.rml = namespaces.rml;
        } else {
          const y2r = new Y2R2();
          triples = y2r.convert(inputData);
        }

        const writer = N3.Writer({prefixes});

        writer.addTriples(triples);
        writer.end((error, result) => {
          if (program.output) {
            if (!path.isAbsolute(program.output)) {
              program.output = path.join(process.cwd(), program.output);
            }

            try {
              fs.writeFileSync(program.output, result);
            } catch (e) {
              console.error(`The RML could not be written to the output file ${program.output}`);
            }
          } else {
            console.log(result);
          }
        });
      } else {
        const parser = N3.Parser();
        const triples = [];

        parser.parse(inputData, (err, triple) => {
          if (triple) {
            triples.push(triple);
          } else if (err) {
            console.log('There is a problem with your input.');
            process.exit(1);
          } else {
            r2y(triples).then(str => {
              if (program.output) {
                if (!path.isAbsolute(program.output)) {
                  program.output = path.join(process.cwd(), program.output);
                }

                try {
                  fs.writeFileSync(program.output, str);
                } catch (e) {
                  console.error(`The RML could not be written to the output file ${program.output}`);
                }
              } else {
                console.log(str);
              }
            });
          }
        });
      }
    } catch (e) {
      if (e.code === 'ENOENT') {
        console.error(`The input file ${program.input} is not found.`);
      } else if (e.code === 'INVALID_YAML') {
        console.error(`The input file contains invalid YAML.`);
      } else {
        console.error(e);
      }
    }
  } else {
    watch(program.input, program.output, program.format);
  }
}