'use client'
import PageHeader from '@/components/shared/PageHeader'
import DataTable from '@/components/shared/DataTable'

export default function Page() {
  return (
    <div>
      <PageHeader title="GDS Assignments" description="Link users to GDS credentials" />
      <DataTable columns={[]} data={[]} emptyMessage="Connect Supabase data to enable this module." />
    </div>
  )
}
