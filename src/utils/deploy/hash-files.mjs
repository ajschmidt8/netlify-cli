import { relative } from 'path'

import fg from "fast-glob";
import hasha from 'hasha'
import pMap from 'p-map';

import { deployFileNormalizer } from '../../lib/edge-functions/deploy.mjs'

import { normalizePath } from './util.mjs'


const hashFiles = async ({
  concurrentHash,
  configPath,
  deployFolder,
  edgeFunctionsDistPath,
  hashAlgorithm = 'sha1',
  rootDir,
  statusCb,
}) => {

  // site.root === deployFolder can happen when users run `netlify deploy --dir .`
  // in that specific case we don't want to publish the repo node_modules
  // when site.root !== deployFolder the behaviour matches our buildbot
  const skipNodeModules = rootDir === deployFolder

  const [regularDeployFiles, wellKnownDeployFiles] = await Promise.all([
    fg(
      [configPath, `${deployFolder}/**`, edgeFunctionsDistPath].filter(Boolean),
      {
        objectMode: true,
        ignore: ["**/__MACOSX/**", skipNodeModules ? `${rootDir}/node_modules/**` : ""].filter(Boolean)
      }
    ),
    // ".well-known" needs its own query until https://github.com/mrmlnc/fast-glob/issues/86 is resolved
    fg(
      [`${deployFolder}/**/.well-known/**`],
      { objectMode: true, dot: true }
    )
  ])

  const deployFiles = [...regularDeployFiles, ...wellKnownDeployFiles]

  // normalizedPath: hash (wanted by deploy API)
  const files = {}
  // hash: [fileObj, fileObj, fileObj]
  const filesShaMap = {}

  const mapper = async (fileObj) => {
    const relname = relative(deployFolder, fileObj.path)
    const normalizedPath = normalizePath(relname)
    const normalizedFileObj = deployFileNormalizer(rootDir,
      { ...fileObj, assetType: "file", normalizedPath, relname }
    )

    statusCb({
      type: 'hashing',
      msg: `Hashing ${relname}`,
      phase: 'progress',
    })
    const hash = await hasha.fromFile(fileObj.path, { algorithm: hashAlgorithm })

    files[normalizedPath] = hash

    // We map a hash to multiple fileObjs because the same file
    // might live in two different locations
    filesShaMap[hash] = [...(filesShaMap[hash] || []), normalizedFileObj]
  }

  await pMap(deployFiles, mapper, { concurrency: concurrentHash })

  return { files, filesShaMap }
}

export default hashFiles
