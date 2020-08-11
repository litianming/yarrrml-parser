#!/usr/bin/env node

/**
 * author: Pieter Heyvaert (pheyvaer.heyvaert@ugent.be)
 * Ghent University - imec - IDLab
 */

const program = require('commander');
const path = require('path');
const fs = require('fs');
const Y2R = require('../lib/rml-generator.js');
const Y2R2 = require('../lib/r2rml-generator.js');
const pkginfo = require('pkginfo');
const N3 = require('n3');
const namespaces = require('prefix-ns').asMap();
const watch = require('../lib/watcher.js');
const glob = require('glob');

namespaces.ql = 'http://semweb.mmlab.be/ns/ql#';

pkginfo(module, 'version');

/**
 * This method collect all values when an option is used multiple times.
 * @param val A single value.
 * @param memo The current array of values.
 * @returns {*} The updated array with the new value.
 */
function collect(val, memo) {
  memo.push(val);
  return memo;
}

program.version(module.exports.version);
program.option('-i, --input <file>', 'input file (can be used multiple times)', collect, []); // We support multiple uses of this option.
program.option('-c, --class', 'use rr:class when appropriate');
program.option('-o, --output <file>', 'output file (default: stdout)');
program.option('-f, --format <format>', 'RML or R2RML (default: RML)');
program.option('-w, --watch', 'watch for file changes');
program.option('-e, --external <value>', 'external references (key=value, can be used multiple times', collect, []); // We support multiple uses of this option.
program.parse(process.argv);

main();

async function main() {
  if (!program.input) {
    console.error('Please provide an input file using -i| --input.');
  } else {
    let inputPaths = [];

    for (let input of program.input) {
      // Check if the input is a regex, e.g., *.yarrrml
      if (glob.hasMagic(input)) {
        const foundFiles = glob.sync(input).map(file => path.join(process.cwd(), file));
        inputPaths = inputPaths.concat(foundFiles);
      } else {
        if (!path.isAbsolute(input)) {
          input = path.join(process.cwd(), input);
        }

        inputPaths.push(input);
      }
    }

    if (!program.watch) {
      try {
        const inputData = [];

        for (const p of inputPaths) {
          const yarrrml = fs.readFileSync(p, 'utf8');
          inputData.push({yarrrml, file: p});
        }

        if (program.format) {
          program.format = program.format.toUpperCase();
        }

        let triples;

        let prefixes = {
          rr: namespaces.rr,
          rdf: namespaces.rdf,
          rdfs: namespaces.rdfs,
          fnml: "http://semweb.mmlab.be/ns/fnml#",
          fno: "https://w3id.org/function/ontology#",
          d2rq: "http://www.wiwiss.fu-berlin.de/suhl/bizer/D2RQ/0.1#"
        };

        const externalReferences = {};

        for (const e of program.external) {
          const keyValue = e.split('=');
          externalReferences[keyValue[0]] = keyValue[1];
        }

        if (!program.format || program.format === 'RML') {
          const y2r = new Y2R({class: !!program.class, externalReferences});

          try {
            triples = await y2r.convert(inputData);
          } catch (e) {
            if (e.code === 'INVALID_YARRRML') {
              if (e.validationErrors.length === 1) {
                console.error(`YARRRML document is invalid: ${e.validationErrors[0].message}.`);
              } else {
                console.error('YARRRML document is invalid:');
                for (const err of e.validationErrors) {
                  console.error(`\t - ${err.message}.`);
                }
              }
            } else {
              console.error(e);
            }

            process.exit(1);
          }

          prefixes.rml = namespaces.rml;
          prefixes.ql = namespaces.ql;
          prefixes[''] = y2r.getBaseIRI();
          prefixes = Object.assign({}, prefixes, y2r.getPrefixes());
        } else {
          const y2r = new Y2R2({class: !!program.class, externalReferences});
          triples = y2r.convert(inputData);
          prefixes[''] = y2r.getBaseIRI();
          prefixes = Object.assign({}, prefixes, y2r.getPrefixes());
        }

        const writer = new N3.Writer({prefixes});

        writer.addQuads(triples);
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

      } catch (e) {
        if (e.code === 'ENOENT') {
          console.error(`The input file ${program.input} is not found.`);
        } else if (e.code === 'INVALID_YAML') {
          console.error(`The input file contains invalid YAML.`);
          console.error(`line ${e.parsedLine}: ${e.message}`);
        } else {
          console.error(e);
        }
      }
    } else {
      watch(program.input, program.output, program.format);
    }
  }
}
