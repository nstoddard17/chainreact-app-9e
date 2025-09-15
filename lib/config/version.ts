/**
 * Application version configuration
 * Update this file when releasing new versions
 */

export const APP_VERSION = {
  major: 0,
  minor: 9,
  patch: 2,
  preRelease: 'beta',
  get full() {
    return `v${this.major}.${this.minor}.${this.patch}${this.preRelease ? `-${this.preRelease}` : ''}`
  },
  get short() {
    return `v${this.major}.${this.minor}.${this.patch}`
  },
  releaseDate: '2025-01-14',
  codename: 'Lightning'
}

export const getVersion = () => APP_VERSION.full
export const getShortVersion = () => APP_VERSION.short