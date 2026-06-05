'use client'
import PageHeader from '@/components/shared/PageHeader'
import DataTable from '@/components/shared/DataTable'

export default function Page() {
  return (
    <div>
      <PageHeader title="OTA Clients" description="Manage OTA company accounts" />
      <DataTable columns={[]} data={[]} emptyMessage="Connect Supabase data to enable this module." />
    </div>
  )
}
