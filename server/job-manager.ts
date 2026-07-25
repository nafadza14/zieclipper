import type { Job, ExportJob } from '@/store/types'

declare global {
  // eslint-disable-next-line no-var
  var __jobStore: Map<string, Job> | undefined
  // eslint-disable-next-line no-var
  var __exportStore: Map<string, ExportJob> | undefined
}

// Use global to persist across Next.js hot reloads in dev
const jobs: Map<string, Job> = global.__jobStore ?? new Map()
const exports: Map<string, ExportJob> = global.__exportStore ?? new Map()

if (!global.__jobStore) global.__jobStore = jobs
if (!global.__exportStore) global.__exportStore = exports

export function createJob(id: string, url: string, model: string, provider: string): Job {
  const job: Job = { id, status: 'downloading', url, model, provider }
  jobs.set(id, job)
  return job
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id)
}

export function updateJob(id: string, update: Partial<Job>) {
  const job = jobs.get(id)
  if (job) jobs.set(id, { ...job, ...update })
}

export function createExportJob(id: string, jobId: string, clipIndex: number): ExportJob {
  const exportJob: ExportJob = { id, jobId, clipIndex, status: 'processing', progress: 0 }
  exports.set(id, exportJob)
  return exportJob
}

export function getExportJob(id: string): ExportJob | undefined {
  return exports.get(id)
}

export function updateExportJob(id: string, update: Partial<ExportJob>) {
  const job = exports.get(id)
  if (job) exports.set(id, { ...job, ...update })
}
