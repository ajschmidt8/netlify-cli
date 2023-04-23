import { expect, test } from 'vitest'

import { DEFAULT_CONCURRENT_HASH } from '../../../../src/utils/deploy/constants.mjs'
import hashFiles from '../../../../src/utils/deploy/hash-files.mjs'
import { withSiteBuilder } from '../../../integration/utils/site-builder.cjs'

test('Hashes files in a folder', async () => {
  await withSiteBuilder('site-with-content', async (builder) => {
    await builder
      .withNetlifyToml({ config: { build: { publish: 'public' } } })
      .withContentFile({
        path: 'public/index.html',
        content: `Root page`,
      })
      .withSymlink({ target: 'public/index.html', path: 'public/file1.html' })
      .buildAsync()

    // add an edge function file here!
    const netlifyConfigFile = 'netlify.toml'
    const regularDeployFile = 'index.html'
    const symlinkDeployFile = 'file1.html'
    const expectedFiles = [netlifyConfigFile, regularDeployFile, symlinkDeployFile]
    const { files, filesShaMap } = await hashFiles({
      concurrentHash: DEFAULT_CONCURRENT_HASH,
      configPath: `${builder.directory}/netlify.toml`,
      deployFolder: `${builder.directory}/public`,
      rootDir: builder.directory,
      statusCb() {},
    })

    expect(Object.entries(files)).toHaveLength(expectedFiles.length)
    expect(Object.values(filesShaMap).flat()).toHaveLength(expectedFiles.length)

    const configFileSha = files[netlifyConfigFile]
    const configFileShaMapEntry = filesShaMap[configFileSha]
    expect(configFileShaMapEntry.length).toBe(1)
    expect(configFileShaMapEntry[0].normalizedPath).toBe('netlify.toml')
    expect(configFileShaMapEntry[0].path).toBe(`${builder.directory}/netlify.toml`)

    const regularDeployFileSha = files[regularDeployFile]
    const symlinkDeployFileSha = files[symlinkDeployFile]
    const regularDeployFileShaMapEntry = filesShaMap[regularDeployFileSha]
    expect(regularDeployFileShaMapEntry.length).toBe(2)
    expect(regularDeployFileSha).toBe(symlinkDeployFileSha)

    const regularDeployFileShaMapArrayEntry = regularDeployFileShaMapEntry.find(el => el.normalizedPath === regularDeployFile)
    const symlinkDeployFileShaMapArrayEntry = regularDeployFileShaMapEntry.find(el => el.normalizedPath === symlinkDeployFile)
    expect(regularDeployFileShaMapArrayEntry).toBeDefined()
    expect(symlinkDeployFileShaMapArrayEntry).toBeDefined()
    expect(regularDeployFileShaMapArrayEntry.normalizedPath).toBe(regularDeployFile)
    expect(symlinkDeployFileShaMapArrayEntry.normalizedPath).toBe(symlinkDeployFile)
    expect(regularDeployFileShaMapArrayEntry.path).toBe(`${builder.directory}/public/${regularDeployFile}`)
    expect(symlinkDeployFileShaMapArrayEntry.path).toBe(`${builder.directory}/public/${symlinkDeployFile}`)
  })
})
