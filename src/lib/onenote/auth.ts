import type { PublicClientApplication, AccountInfo } from '@azure/msal-browser'

const SCOPES = ['Notes.Read']

let pca: PublicClientApplication | null = null

async function getMsal(): Promise<PublicClientApplication> {
  if (pca) return pca
  const { PublicClientApplication } = await import('@azure/msal-browser')
  const clientId = import.meta.env.VITE_ONENOTE_CLIENT_ID as string | undefined
  if (!clientId) throw new Error('VITE_ONENOTE_CLIENT_ID is not configured')
  pca = new PublicClientApplication({
    auth: {
      clientId,
      authority: 'https://login.microsoftonline.com/common',
      redirectUri: window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, ''),
    },
    cache: { cacheLocation: 'sessionStorage' },
  })
  await pca.initialize()
  return pca
}

export async function signIn(): Promise<string> {
  const msal = await getMsal()
  const result = await msal.loginPopup({ scopes: SCOPES })
  return result.accessToken
}

export async function getToken(): Promise<string> {
  const msal = await getMsal()
  const accounts = msal.getAllAccounts()
  if (!accounts.length) throw new Error('Not signed in to Microsoft')
  try {
    const result = await msal.acquireTokenSilent({
      scopes: SCOPES,
      account: accounts[0],
    })
    return result.accessToken
  } catch {
    const result = await msal.acquireTokenPopup({ scopes: SCOPES })
    return result.accessToken
  }
}

export async function signOut(): Promise<void> {
  if (!pca) return
  const accounts = pca.getAllAccounts()
  if (accounts.length) {
    await pca.logoutPopup({ account: accounts[0] })
  }
  pca = null
}

export async function getAccount(): Promise<AccountInfo | null> {
  try {
    const msal = await getMsal()
    return msal.getAllAccounts()[0] ?? null
  } catch {
    return null
  }
}

export function isConfigured(): boolean {
  return !!import.meta.env.VITE_ONENOTE_CLIENT_ID
}
