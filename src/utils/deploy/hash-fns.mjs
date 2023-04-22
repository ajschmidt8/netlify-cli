import { readFile } from 'fs/promises'
import path from 'path'

import hasha from 'hasha'

import { getPathInProject } from '../../lib/settings.mjs'
import { INTERNAL_FUNCTIONS_FOLDER } from '../functions/functions.mjs'


// Maximum age of functions manifest (2 minutes).
const MANIFEST_FILE_TTL = 12e4

const getFunctionZips = async ({
  directories,
  functionsConfig,
  manifestPath,
  rootDir,
  skipFunctionsCache,
  statusCb,
  tmpDir,
}) => {
  statusCb({
    type: 'functions-manifest',
    msg: 'Looking for a functions cache...',
    phase: 'start',
  })

  if (manifestPath) {
    try {
      // read manifest.json file
      const { functions, timestamp } = JSON.parse(await readFile(manifestPath))
      const manifestAge = Date.now() - timestamp

      if (manifestAge > MANIFEST_FILE_TTL) {
        throw new Error('Manifest expired')
      }

      statusCb({
        type: 'functions-manifest',
        msg: 'Deploying functions from cache (use --skip-functions-cache to override)',
        phase: 'stop',
      })

      return functions
    } catch {
      statusCb({
        type: 'functions-manifest',
        msg: 'Ignored invalid or expired functions cache',
        phase: 'stop',
      })
    }
  } else {
    const msg = skipFunctionsCache
      ? 'Ignoring functions cache (use without --skip-functions-cache to change)'
      : 'No cached functions were found'

    statusCb({
      type: 'functions-manifest',
      msg,
      phase: 'stop',
    })
  }

  const { zipFunctions } = await import('@netlify/zip-it-and-ship-it')

  return await zipFunctions(directories, tmpDir, {
    basePath: rootDir,
    configFileDirectories: [getPathInProject([INTERNAL_FUNCTIONS_FOLDER])],
    config: functionsConfig,
  })
}

const hashFns = async (
  directories,
  {
    concurrentHash,
    functionsConfig,
    hashAlgorithm = 'sha256',
    manifestPath,
    rootDir,
    skipFunctionsCache,
    statusCb,
    tmpDir,
  },
) => {
  // Early out if no functions directories are configured.
  if (directories.length === 0) {
    return { functions: {}, functionsWithNativeModules: [], shaMap: {} }
  }

  if (!tmpDir) {
    throw new Error('Missing tmpDir directory for zipping files')
  }

  const functionZips = await getFunctionZips({
    directories,
    functionsConfig,
    manifestPath,
    rootDir,
    skipFunctionsCache,
    statusCb,
    tmpDir,
  })
  const fileObjs = functionZips.map(({ displayName, generator, path: functionPath, runtime }) => ({
    path: functionPath,
    root: tmpDir,
    relname: path.relative(tmpDir, functionPath),
    basename: path.basename(functionPath),
    extname: path.extname(functionPath),
    type: 'file',
    assetType: 'function',
    normalizedPath: path.basename(functionPath, path.extname(functionPath)),
    runtime,
    displayName,
    generator,
  }))
  const fnConfig = functionZips
    .filter((func) => Boolean(func.displayName || func.generator))
    .reduce(
      (funcs, curr) => ({ ...funcs, [curr.name]: { display_name: curr.displayName, generator: curr.generator } }),
      {},
    )
  const functionSchedules = functionZips
    .map(({ name, schedule }) => schedule && { name, cron: schedule })
    .filter(Boolean)
  const functionsWithNativeModules = functionZips.filter(
    ({ nativeNodeModules }) => nativeNodeModules !== undefined && Object.keys(nativeNodeModules).length !== 0,
  )

  // normalizedPath: hash (wanted by deploy API)
  const functions = {}
  // hash: [fileObj, fileObj, fileObj]
  const fnShaMap = {}

  // AJTODO: set up concurrency limits
  await Promise.all(fileObjs.map(async (fileObj) => {
    statusCb({
      type: 'hashing',
      msg: `Hashing ${fileObj.relname}`,
      phase: 'progress',
    })
    const hash = await hasha.fromFile(fileObj.path, { algorithm: hashAlgorithm })

    // add file entries to objects
    functions[fileObj.normalizedPath] = hash

    // We map a hash to multiple fileObjs because the same file
    // might live in two different locations
    fnShaMap[hash] = [...(fnShaMap[hash] || []), fileObj]
  }))

  return { functionSchedules, functions, functionsWithNativeModules, fnShaMap, fnConfig }
}

export default hashFns
