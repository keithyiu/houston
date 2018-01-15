/**
 * houston/src/worker/task/build/deb.ts
 * Builds a debian package
 */

import * as fs from 'fs-extra'
import * as os from 'os'
import * as path from 'path'

import render from '../../../lib/template'
import { Docker } from '../../docker'
import { Log } from '../../log'
import { Change } from '../../storable'
import { Task } from '../task'

export class BuildDeb extends Task {

  /**
   * Returns the path of the liftoff cache
   *
   * @return {string}
   */
  protected static get cachePath () {
    return path.resolve(os.tmpdir(), 'liftoff')
  }

  /**
   * Location of the liftoff log
   *
   * @return {string}
   */
  protected get logPath () {
    return path.resolve(this.worker.workspace, 'build-deb.log')
  }

  /**
   * Returns the liftoff distribution to use.
   * NOTE: Because liftoff does not know about elementary distros, we map
   * them to the Ubuntu equivalents
   *
   * @return {string}
   */
  protected get distribution () {
    switch (this.worker.storage.distribution) {
      case ('loki'):
        return 'xenial'
      case ('juno'):
        return 'bionic'
      default:
        return this.worker.storage.distribution
    }
  }

  /**
   * Runs liftoff
   *
   * @async
   * @return {void}
   */
  public async run () {
    await this.setup()

    const p = path.resolve(this.worker.workspace, 'build-deb')
    const docker = await this.docker(p)

    const arch = this.worker.storage.architecture
    const dist = this.distribution
    const cmd = `-a ${arch} -d ${dist} -o /tmp/houston`

    // Liftoff uses chroot, so we need higher permissions to run
    const exit = await docker.run(cmd, { Privileged: true })

    if (exit !== 0) {
      throw await this.log()
    }
  }

  protected async setup () {
    const from = path.resolve(this.worker.workspace, 'clean')
    const to = path.resolve(this.worker.workspace, 'build-deb')

    await fs.ensureDir(to)
    await fs.copy(from, to)
  }

  /**
   * Formats a liftoff error
   *
   * @async
   * @return {Log}
   */
  protected async log () {
    const p = path.resolve(__dirname, 'debLog.md')
    const log = await fs.readFile(this.logPath, 'utf8')

    return Log.template(Log.Level.ERROR, p, {
      log,
      storage: this.worker.storage
    })
  }

  /**
   * Returns a docker instance to use for liftoff
   *
   * @async
   * @param {string} p - Folder to mount for building
   * @return {Docker}
   */
  protected async docker (p: string): Promise<Docker> {
    const docker = new Docker(this.worker.config, 'build-deb')

    const exists = await docker.exists()
    if (exists === false) {
      const folder = path.resolve(__dirname, 'deb')
      await docker.create(folder)
    }

    docker.log = this.logPath

    docker.mount(BuildDeb.cachePath, '/var/cache/liftoff')
    docker.mount(p, '/tmp/houston')

    return docker
  }
}