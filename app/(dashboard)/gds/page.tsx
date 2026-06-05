'use client'
import PageHeader from '@/components/shared/PageHeader'
import DataTable from '@/components/shared/DataTable'

export default function Page() {
  return (
    <div>
      <PageHeader title="GDS" description="Manage GDS platforms" />
      <DataTable columns={[]} data={[]} emptyMessage="Connect Supabase data to enable this module." />
    </div>
  )
}
