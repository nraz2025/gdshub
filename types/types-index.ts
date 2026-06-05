// ── Auth / Profiles ─────────────────────────────────────────
export type UserRole = 'admin' | 'user'

export interface Profile {
  id: string
  role: UserRole
  created_at: string
  updated_at: string
}

// ── Users ────────────────────────────────────────────────────
export type UserStatus = 'Active' | 'Inactive'

export interface User {
  id: string
  first_name: string
  last_name: string
  email_address: string
  ota_client: boolean
  status: UserStatus
  created_at: string
  updated_at: string
}

// ── GDS ──────────────────────────────────────────────────────
export type GDSName = 'Sabre' | 'Amadeus' | 'Travelport'

export interface GDS {
  id: number
  name: GDSName
  created_at: string
  updated_at: string
}

// ── PCC List ─────────────────────────────────────────────────
export type PCCStatus = 'Active' | 'Pending' | 'Vacant'

export interface PCCList {
  id: number
  gds_id: number
  pcc: string
  status: PCCStatus
  created_at: string
  updated_at: string
  gds?: GDS
}

// ── GDS Functionality ─────────────────────────────────────────
export interface GDSFeature {
  id: number
  key: string
  label: string
  cost: number
  currency: string
  created_at: string
}

export interface GDSProfileFeature {
  profile_id: number
  feature_id: number
  gds_features?: GDSFeature
}

export interface GDSFunctionality {
  id: number
  gds_id: number
  name: string
  created_at: string
  updated_at: string
  gds?: GDS
  gds_profile_features?: GDSProfileFeature[]
}

// ── GDS Information ───────────────────────────────────────────
export interface GDSInformation {
  pcc_list_id: number
  functionality_id: number
  pcc_list?: PCCList
  gds_functionality?: GDSFunctionality
}

// ── GDS User types ────────────────────────────────────────────
export type SabreStatus = 'Active' | 'Inactive' | 'Suspended'

export interface SabreUser {
  id: number
  epr: string
  initial: string | null
  status: SabreStatus
  pcc: string | null
  user_id: string | null
  ota: boolean
  created_at: string
  updated_at: string
  users?: User
}

export interface AmadeusUser {
  id: number
  login: string
  sign_on_id: string | null
  initial: string | null
  duty_code: string | null
  oid: string | null
  user_id: string | null
  ota: boolean
  created_at: string
  updated_at: string
  users?: User
}

export interface TravelportUser {
  id: number
  sign_on_id: string | null
  cid: string | null
  gtid: string | null
  pcc: string | null
  user_id: string | null
  ota: boolean
  created_at: string
  updated_at: string
  users?: User
}

// ── GDS Assigned User ─────────────────────────────────────────
export interface GDSAssignedUser {
  id: number
  user_id: string
  gds_id: number
  sabre_user_id: number | null
  amadeus_user_id: number | null
  travelport_user_id: number | null
  created_at: string
  updated_at: string
  users?: User
  gds?: GDS
  sabre_user?: SabreUser
  amadeus_user?: AmadeusUser
  travelport_user?: TravelportUser
}

// ── MidOffice Configuration ───────────────────────────────────
export interface MidOfficeConfiguration {
  id: number
  auto_ticketing: boolean
  auto_invoice: boolean
  auto_send_invoice: boolean
  remarks: string | null
  created_at: string
  updated_at: string
}

// ── OTA Client ────────────────────────────────────────────────
export interface OTAClient {
  id: number
  company_name: string
  user_id: string | null
  midoffice_id: number | null
  created_at: string
  updated_at: string
  users?: User
  midoffice_configuration?: MidOfficeConfiguration
}
