import commonjs from '@rollup/plugin-commonjs'
import dts from 'rollup-plugin-dts'
import exec from 'execa'
import json from '@rollup/plugin-json'
import { babel } from '@rollup/plugin-babel'
import { fs } from 'haoma/lib/cliUtils'
import { getBabelConfig } from 'haoma'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import { packages } from './packages'
import { rollup } from 'rollup'
import { terser } from 'rollup-plugin-terser'

// @ts-ignore
import virtual from '@rollup/plugin-virtual'

async function main() {
  await Promise.all(
    packages.map(async pkg => {
      const bundle = await rollup({
        input: 'index.js',
        plugins: [
          json(),
          commonjs(),
          nodeResolve({
            extensions: ['.js', '.es6', '.es', '.mjs'],
          }),
          babel({
            ...(getBabelConfig({
              module: 'esm',
              target: 'browser',
              typescript: false,
            }) as any),
            extensions: ['.js', '.es6', '.es', '.mjs'],
            babelHelpers: 'runtime',
          }),
          virtual({
            'index.js': `
              import ${pkg.umd} from '${pkg.package}';
              export default ${pkg.umd};
            `.trim(),
          }),
        ],
      })
      await Promise.all([
        bundle.write({
          file: `dist/${pkg.package}/umd.js`,
          format: 'umd',
          name: pkg.umd,
          exports: 'default',
          sourcemap: true,
        }),
        bundle.write({
          file: `dist/${pkg.package}/umd.min.js`,
          format: 'umd',
          name: pkg.umd,
          exports: 'default',
          plugins: [terser()],
          sourcemap: true,
        }),
      ])
      await bundle.close()

      const bundleDts = await rollup({
        input: 'index.ts',
        plugins: [
          dts(),
          virtual({
            'index.ts': `
              import ${pkg.umd} from '${pkg.package}';
              export default ${pkg.umd};
            `.trim(),
          }),
        ],
      })
      await bundleDts.write({
        file: `dist/${pkg.package}/umd.d.ts`,
        format: 'es',
      })
      await bundleDts.close()

      await fs.copyFile('README.md', `dist/${pkg.package}/README.md`)

      await fs.writeJSON(
        `dist/${pkg.package}/package.json`,
        {
          name: `@umdify/${pkg.package}`,
          description: require(`${pkg.package}/package.json`).description,
          version: require(`${pkg.package}/package.json`).version,
          main: 'umd.js',
          types: 'umd.d.ts',
          homepage: 'https://github.com/fjc0k/umdify',
          publishConfig: {
            access: 'public',
            registry: 'https://registry.npmjs.org/',
          },
        },
        { spaces: 2 },
      )
      await exec('npm', ['publish', `dist/${pkg.package}`], {
        stdio: 'inherit',
      })
    }),
  )
}

main()
