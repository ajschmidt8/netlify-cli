import { promisify } from 'util'

import fg from "fast-glob";
import pumpModule from 'pump'

import { fileNormalizerCtor, hasherCtor, manifestCollectorCtor } from './hasher-segments.mjs'

const pump = promisify(pumpModule)

const hashFiles = async ({
  assetType = 'file',
  concurrentHash,
  configPath,
  deployFolder,
  edgeFunctionsDistPath,
  filter,
  hashAlgorithm = 'sha1',
  normalizer,
  statusCb,
}) => {
  if (!filter) throw new Error('Missing filter function option')

  // AJTODO (remove node_modules option)
  const fileStream = fg.stream([configPath, `${deployFolder}/**`, edgeFunctionsDistPath].filter(Boolean), { ignore: ["**/node_modules/**"], objectMode: true });
  const hasher = hasherCtor({ concurrentHash, hashAlgorithm })
  const fileNormalizer = fileNormalizerCtor({ assetType, normalizer, deployFolder })

  // Written to by manifestCollector
  // normalizedPath: hash (wanted by deploy API)
  const files = {}
  // hash: [fileObj, fileObj, fileObj]
  const filesShaMap = {}
  const manifestCollector = manifestCollectorCtor(files, filesShaMap, { statusCb, assetType })

  await pump(fileStream, filter, hasher, fileNormalizer, manifestCollector)

  return { files, filesShaMap }
}

export default hashFiles
