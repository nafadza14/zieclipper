'use client'
import { useState, useEffect, useRef } from 'react'
import type { ExportJob } from '@/store/types'

export function useExportJob(exportId: string | null) {
  const [job, setJob] = useState<ExportJob | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!exportId) return

    const poll = async () => {
      const res = await fetch(`/api/export?id=${exportId}`)
      if (!res.ok) return
      const data: ExportJob = await res.json()
      setJob(data)

      if (data.status === 'done' || data.status === 'error') {
        if (intervalRef.current) clearInterval(intervalRef.current)
      }
    }

    poll()
    intervalRef.current = setInterval(poll, 1000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [exportId])

  return job
}
