import type { PublicClientApplication, AccountInfo } from '@azure/msal-browser'

const SCOPES = ['Notes.Read']

let pca: PublicClientApplication | null = null
let redirectResult: Promise<boolean> | null = null

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

async function getMsal(): Promise<PublicClientApplication> {
  if (pca) return pca
  const { PublicClientApplication } = await import('@azure/msal-browser')
  const clientId = import.meta.env.VITE_ONENOTE_CLIENT_ID as string | undefined
  if (!clientId) throw new Error('VITE_ONENOTE_CLIENT_ID is not configured')
  pca = new PublicClientApplication({
    auth: {
      clientId,
      authority: 'https://login.microsoftonline.com/consumers',
      redirectUri: window.location.origin + BASE,
    },
    cache: { cacheLocation: 'sessionStorage' },
  })
  await pca.initialize()
  return pca
}

export function handleRedirect(): Promise<boolean> {
  if (!redirectResult) {
    redirectResult = (async () => {
      const msal = await getMsal()
      const result = await msal.handleRedirectPromise()
      return !!result
    })()
  }
  return redirectResult
}

export async function signIn(): Promise<void> {
  const msal = await getMsal()
  sessionStorage.setItem('onenote-auth-pending', '1')
  await msal.loginRedirect({ scopes: SCOPES })
}

export async function getToken(): Promise<string> {
  const msal = await getMsal()
  const accounts = msal.getAllAccounts()
  if (!accounts.length) throw new Error('Not signed in to Microsoft')
  const result = await msal.acquireTokenSilent({
    scopes: SCOPES,
    account: accounts[0],
  })
  return result.accessToken
}

export async function signOut(): Promise<void> {
  for (const key of Object.keys(sessionStorage)) {
    if (key.includes('msal') || key.includes('login')) {
      sessionStorage.removeItem(key)
    }
  }
  pca = null
  redirectResult = null
}

export async function getAccount(): Promise<AccountInfo | null> {
  try {
    const msal = await getMsal()
    return msal.getAllAccounts()[0] ?? null
  } catch {
    return null
  }
}

export function isAuthPending(): boolean {
  return sessionStorage.getItem('onenote-auth-pending') === '1'
}

export function clearAuthPending(): void {
  sessionStorage.removeItem('onenote-auth-pending')
}

export function isConfigured(): boolean {
  return !!import.meta.env.VITE_ONENOTE_CLIENT_ID
}
