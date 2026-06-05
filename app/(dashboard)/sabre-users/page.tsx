'use client'
import PageHeader from '@/components/shared/PageHeader'
import DataTable from '@/components/shared/DataTable'

export default function Page() {
  return (
    <div>
      <PageHeader title="Sabre Users" description="Manage Sabre EPR accounts" />
      <DataTable columns={[]} data={[]} emptyMessage="Connect Supabase data to enable this module." />
    </div>
  )
}
