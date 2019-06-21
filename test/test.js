/* global describe it */

// -----------------------------------------------------------------------------
// Requires
// -----------------------------------------------------------------------------

const fs = require('fs-plus')
const glob = require('glob')
const assert = require('assert')
const esprima = require('esprima')
const traverse = require('traverse')

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const exerciseFiles = glob.sync('exercises/*.js')
const modulesDir = 'exercises-modules/'
const utf8 = 'utf8'
const squigglyLine = '// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n'
const exportsComment = '\n\n\n\n\n' +
  squigglyLine +
  '// Module Exports (automatically generated)\n' +
  squigglyLine

// -----------------------------------------------------------------------------
// Stateful
// -----------------------------------------------------------------------------

let allSyntaxValid = true

// -----------------------------------------------------------------------------
// Module Magic
// -----------------------------------------------------------------------------

// returns an array of the top-level function names from a script
function getTopLevelFunctions (syntaxTree) {
  let fnNames = []
  for (let i = 0; i < syntaxTree.body.length; i++) {
    const itm = syntaxTree.body[i]
    if (itm.type === 'FunctionDeclaration') {
      fnNames.push(itm.id.name)
    }
  }
  return fnNames
}

// example filename --> module filename
function moduleName (f) {
  return f.replace('exercises/', modulesDir)
    .replace('.js', '.module.js')
}

function moduleExportStatement (fnName) {
  return 'module.exports.' + fnName + ' = ' + fnName
}

function createModuleFile (f) {
  const fileContents = fs.readFileSync(f, utf8)
  const syntaxTree = esprima.parseScript(fileContents)
  const topLevelFns = getTopLevelFunctions(syntaxTree)
  const moduleFileContents = fileContents +
                             exportsComment +
                             topLevelFns.map(moduleExportStatement).join('\n') +
                             '\n\n\n'
  const moduleFileName = moduleName(f)
  fs.writeFileSync(moduleFileName, moduleFileContents)
}

function createModuleFiles () {
  if (!fs.existsSync(modulesDir)) {
    fs.mkdirSync(modulesDir)
  }
  exerciseFiles.forEach(createModuleFile)
}

function destroyModuleFiles () {
  fs.removeSync(modulesDir)
}

// -----------------------------------------------------------------------------
// Check JS Syntax
// -----------------------------------------------------------------------------

// returns the "body" part of fnName
// NOTE: assumes that fnName is a top-level function
function getFnBody (body, fnName) {
  for (let i = 0; i < body.length; i++) {
    if (body[i].type === 'FunctionDeclaration' &&
        body[i].id.name === fnName) {
      return body[i].body
    }
  }

  return false
}

// does "fnName" return variable "identifierName"?
function fnReturnsIdentifier (syntaxTree, fnName, identifierName) {
  const fnBodyStatements = getFnBody(syntaxTree, fnName)
  if (!fnBodyStatements) return false

  let foundReturnStatement = false
  traverse(fnBodyStatements).forEach(function (statement) {
    if (isArray(statement)) return

    if (isObject(statement) && statement.type && statement.type === 'ReturnStatement' &&
        statement.argument && isObject(statement.argument) && statement.argument.type && statement.argument.type === 'Identifier' &&
        statement.argument.name && statement.argument.name === identifierName) {
      foundReturnStatement = true
    }
  })
  return foundReturnStatement
}

// does "fnName" contain a variable named "varName"?
function fnContainVariable (syntaxTree, fnName, varName) {
  const fnBodyStatements = getFnBody(syntaxTree, fnName)
  if (!fnBodyStatements) return false

  let variableExists = false
  traverse(fnBodyStatements).forEach(function (statement) {
    if (isArray(statement)) return

    if (isObject(statement) && statement.type && statement.type === 'VariableDeclarator' &&
        isObject(statement.id) && statement.id.type && statement.id.type === 'Identifier' &&
        statement.id.name && statement.id.name === varName) {
      variableExists = true
    }
  })
  return variableExists
}

// does "fnName" contain "expressionType"?
function functionContainStatement (syntaxTree, fnName, expressionType) {
  const fnBodyStatements = getFnBody(syntaxTree, fnName)
  if (!fnBodyStatements) return false

  // NOTE: this is a total hack, but works fine for this use case
  const json = JSON.stringify(fnBodyStatements)
  return json.includes('"type":"' + expressionType + '"')
}

function checkFileSyntax (f) {
  const fileContents = fs.readFileSync(f, utf8)

  // check for empty files
  if (fileContents === '') {
    it(f + ' is an empty file', function () {
      assert.fail(f + ' should not be empty')
    })
    allSyntaxValid = false
    return
  }

  // try parsing the JS
  let parsed = null
  try {
    parsed = esprima.parseScript(fileContents)
  } catch (e) { }
  if (!parsed) {
    allSyntaxValid = false

    it(f + ' should be valid JavaScript syntax', function () {
      assert.ok(parsed, f + ' has invalid syntax')
    })
  }
}

function checkJSSyntax () {
  exerciseFiles.forEach(checkFileSyntax)
}

// -----------------------------------------------------------------------------
// Util
// -----------------------------------------------------------------------------

function isBoolean (b) {
  return b === true || b === false
}

function isFn (f) {
  return typeof f === 'function'
}

function isNumber (n) {
  return typeof n === 'number' && !Number.isNaN(n)
}

function isFloat (f) {
  return isNumber(f) && f % 1 !== 0
}

function isObject (o) {
  return typeof o === 'object' && o !== null && isFn(o.hasOwnProperty)
}

function isArray (a) {
  return Array.isArray(a)
}

// -----------------------------------------------------------------------------
// Assertion Utils
// -----------------------------------------------------------------------------

function checkForFunction (filename, module, fnName) {
  it(filename + ' should contain a function "' + fnName + '"', function () {
    assert(isFn(module[fnName]), 'function "' + fnName + '" not found in exercises/' + filename)
  })
}

function checkModuleForFunctions (filename, module, fns) {
  const msg = filename + ' should have ' + fns.length + ' functions: ' + fns.join(', ')
  it(msg, function () {
    fns.forEach(function (fnName) {
      assert(isFn(module[fnName]), 'function "' + fnName + '" not found')
    })
  })
}

function assertContainsVariable (syntaxTree, fnName, varName) {
  assert.ok(fnContainVariable(syntaxTree.body, fnName, varName),
    'function "' + fnName + '" should contain the variable "' + varName + '"')
}

function assertReturnsVariable (syntaxTree, fnName, varName) {
  assert.ok(fnReturnsIdentifier(syntaxTree.body, fnName, varName),
    'function "' + fnName + '" should return the variable "' + varName + '"')
}

// this is a hack, but mostly works
// TODO: check the syntax tree properly instead
function functionContainsText (moduleText, fnName, expressionText) {
  const functionStartIdx = moduleText.indexOf('function ' + fnName)
  if (functionStartIdx === -1) return false

  const moduleTextAfterFn = moduleText.substring(functionStartIdx)
  return moduleTextAfterFn.includes(expressionText)
}

// -----------------------------------------------------------------------------
// 100 - Numbers
// -----------------------------------------------------------------------------

function check100 () {
  const moduleFileName = '../' + moduleName('exercises/100-numbers.js')
  let module = null
  try {
    module = require(moduleFileName)
  } catch (e) { }

  if (!module) {
    it('Unable to read ' + moduleFileName, function () {
      assert.fail('Unable to read ' + moduleFileName)
    })
    return
  }

  const fileContents = fs.readFileSync('exercises/100-numbers.js', utf8)
  const syntaxTree = esprima.parseScript(fileContents)

  checkModuleForFunctions('100-numbers.js', module, ['makeANumber', 'makeAnInteger', 'makeAFloat', 'makeZero'])

  it('"makeANumber" function', function () {
    assertContainsVariable(syntaxTree, 'makeANumber', 'myNum')
    assertReturnsVariable(syntaxTree, 'makeANumber', 'myNum')
    assert(isNumber(module.makeANumber()), 'makeANumber() should return a valid JavaScript number.')
  })

  it('"makeAnInteger" function', function () {
    assertContainsVariable(syntaxTree, 'makeAnInteger', 'myInt')
    assertReturnsVariable(syntaxTree, 'makeAnInteger', 'myInt')
    assert(Number.isInteger(module.makeAnInteger()), 'makeAnInteger() should return a integer.')
  })

  it('"makeAFloat" function', function () {
    assertContainsVariable(syntaxTree, 'makeAFloat', 'myFloat')
    assertReturnsVariable(syntaxTree, 'makeAFloat', 'myFloat')
    assert(isFloat(module.makeAFloat()), 'makeAFloat() should return a float.')
  })

  it('"makeZero" function', function () {
    assertContainsVariable(syntaxTree, 'makeZero', 'zilch')
    assertReturnsVariable(syntaxTree, 'makeZero', 'zilch')
    assert(module.makeZero() === 0, 'makeZero() should return the number 0.')
  })
}

// -----------------------------------------------------------------------------
// 102 - Undefined, Booleans, Null
// -----------------------------------------------------------------------------

function check102 () {
  const moduleFileName = '../' + moduleName('exercises/102-undefined-booleans-null.js')
  let module = null
  try {
    module = require(moduleFileName)
  } catch (e) { }

  if (!module) {
    it('Unable to read ' + moduleFileName, function () {
      assert.fail('Unable to read ' + moduleFileName)
    })
    return
  }

  const fileContents = fs.readFileSync('exercises/102-undefined-booleans-null.js', utf8)
  const syntaxTree = esprima.parseScript(fileContents)

  checkForFunction('102-undefined-booleans-null.js', module, 'makeNothing')
  it('"makeNothing" function', function () {
    assertContainsVariable(syntaxTree, 'makeNothing', 'huh')
    assertReturnsVariable(syntaxTree, 'makeNothing', 'huh')
    assert(undefined === module.makeNothing(), 'makeNothing() should return undefined.')
  })

  checkForFunction('102-undefined-booleans-null.js', module, 'makeBoolean')
  it('"makeBoolean" function', function () {
    assertContainsVariable(syntaxTree, 'makeBoolean', 'myBool')
    assertReturnsVariable(syntaxTree, 'makeBoolean', 'myBool')
    assert(isBoolean(module.makeBoolean()), 'makeBoolean() should return a boolean value (true or false).')
  })

  checkForFunction('102-undefined-booleans-null.js', module, 'makeTrue')
  it('"makeTrue" function', function () {
    assertContainsVariable(syntaxTree, 'makeTrue', 'yup')
    assertReturnsVariable(syntaxTree, 'makeTrue', 'yup')
    assert(module.makeTrue() === true, 'makeTrue() should return the boolean value true.')
  })

  checkForFunction('102-undefined-booleans-null.js', module, 'makeFalse')
  it('"makeFalse" function', function () {
    assertContainsVariable(syntaxTree, 'makeFalse', 'nope')
    assertReturnsVariable(syntaxTree, 'makeFalse', 'nope')
    assert(module.makeFalse() === false, 'makeFalse() should return the boolean value false.')
  })

  checkForFunction('102-undefined-booleans-null.js', module, 'makeNull')
  it('"makeNull" function', function () {
    assertContainsVariable(syntaxTree, 'makeNull', 'nothingMuch')
    assertReturnsVariable(syntaxTree, 'makeNull', 'nothingMuch')
    assert(module.makeNull() === null, 'makeNull() should return null.')
  })
}

// -----------------------------------------------------------------------------
// 104 - Strings
// -----------------------------------------------------------------------------

const tarPitAbstract = 'Complexity is the single major difficulty in the successful development of large-scale software systems. ' +
  'Following Brooks we distinguish accidental from essential difficulty, but disagree with his premise that most complexity remaining in contemporary systems is essential. ' +
  'We identify common causes of complexity and discuss general approaches which can be taken to eliminate them where they are accidental in nature. ' +
  'To make things more concrete we then give an outline for a potential complexity-minimizing approach based on functional programming and Codd’s relational model of data.'

function check104 () {
  const moduleFileName = '../' + moduleName('exercises/104-strings.js')
  let module = null
  try {
    module = require(moduleFileName)
  } catch (e) { }

  if (!module) {
    it('Unable to read ' + moduleFileName, function () {
      assert.fail('Unable to read ' + moduleFileName)
    })
    return
  }

  const fileContents = fs.readFileSync('exercises/104-strings.js', utf8)
  const syntaxTree = esprima.parseScript(fileContents)

  checkForFunction('104-strings.js', module, 'helloWorld')
  it('"helloWorld" function', function () {
    assert(module.helloWorld() === 'Hello, world!', 'helloWorld() should return the string "Hello, world!".')
  })

  checkForFunction('104-strings.js', module, 'helloName')
  it('"helloName" function', function () {
    assert(module.helloName('Bob') === 'Hello, Bob!', 'helloName("Bob") should return the string "Hello, Bob!".')
    assert(module.helloName('') === 'Hello, !', 'helloName("") should return the string "Hello, !".')
  })

  checkForFunction('104-strings.js', module, 'abstractLength')
  it('"abstractLength" function', function () {
    assert(module.abstractLength() === tarPitAbstract.length, 'abstractLength() should return the length of the "tarPitAbstract" string.')
    assert.ok(functionContainsText(fileContents, 'abstractLength', 'tarPitAbstract.length'), 'abstractLength() should use the .length property')
  })

  const chorus = 'Who let the dogs out?'
  checkForFunction('104-strings.js', module, 'makeLoud')
  it('"makeLoud" function', function () {
    assert(module.makeLoud() === chorus.toUpperCase(), 'makeLoud() should return the string "' + chorus.toUpperCase() + '"')
    assert.ok(functionContainsText(fileContents, 'makeLoud', '.toUpperCase()'), 'makeLoud() should use the .toUpperCase() method')
  })

  checkForFunction('104-strings.js', module, 'makeQuiet')
  it('"makeQuiet" function', function () {
    assert(module.makeQuiet('ABC') === 'abc', 'makeQuiet("ABC") should return the string "abc"')
    assert(module.makeQuiet('abc') === 'abc', 'makeQuiet("abc") should return the string "abc"')
    assert(module.makeQuiet('XyZ') === 'xyz', 'makeQuiet("XyZ") should return the string "xyz"')
    assert(module.makeQuiet('AAA bbb CCC') === 'aaa bbb ccc', 'makeQuiet("AAA bbb CCC") should return the string "aaa bbb ccc"')
    assert(module.makeQuiet('') === '', 'makeQuiet("") should return the string ""')
    assert.ok(functionContainsText(fileContents, 'makeQuiet', '.toLowerCase()'), 'makeQuiet() should use the .toLowerCase() method')
  })
}

// -----------------------------------------------------------------------------
// Run the tests
// -----------------------------------------------------------------------------

describe('JavaScript Syntax', checkJSSyntax)

// only run the test suite if there were no syntax errors
if (allSyntaxValid) {
  createModuleFiles()
  describe('Numbers', check100)
  describe('Undefined, booleans, null', check102)
  describe('Strings', check104)
  // TODO: Math
  // TODO: Arrays
  // TODO: Objects
  // TODO: functions default parameters?
  destroyModuleFiles()
}
