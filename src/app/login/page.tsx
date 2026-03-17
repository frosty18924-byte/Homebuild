'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=Lato:wght@300;400;700&display=swap');
:root{--cream:#F5F0E8;--warm-white:#FAF7F2;--terra:#C1714F;--charcoal:#3D3530;--grey:#8A7E78}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Lato',sans-serif;background:var(--cream);color:var(--charcoal)}
.auth-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem;background:var(--cream)}
.auth-card{width:100%;max-width:420px;background:var(--warm-white);border-radius:18px;border:1px solid rgba(193,113,79,.12);box-shadow:0 12px 30px rgba(61,53,48,.08);padding:2rem}
.auth-title{font-family:'Playfair Display',serif;font-size:1.6rem;color:var(--charcoal)}
.auth-sub{font-size:.82rem;color:var(--grey);margin-top:.35rem}
.auth-form{margin-top:1.2rem;display:flex;flex-direction:column;gap:.7rem}
.auth-input{padding:.6rem .8rem;border-radius:10px;border:1px solid rgba(193,113,79,.2);background:white;font-family:'Lato',sans-serif;font-size:.85rem;color:var(--charcoal);outline:none}
.auth-input:focus{border-color:var(--terra)}
.auth-btn{padding:.6rem 1rem;border-radius:10px;border:none;background:var(--charcoal);color:var(--cream);font-size:.75rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;transition:all .15s}
.auth-btn:hover{background:#2b2522}
.auth-btn:disabled{opacity:.5;cursor:not-allowed}
.auth-error{font-size:.75rem;color:var(--terra);margin-top:.4rem}
`

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/')
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) router.replace('/')
    })
    return () => subscription.unsubscribe()
  }, [router])

  const handleSignIn = async () => {
    if (!email || !password) return
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) setError(error.message)
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLE }} />
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="auth-title">Hearth</div>
          <div className="auth-sub">Sign in with your email and password</div>
          <div className="auth-form">
            <input
              className="auth-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
            <input
              className="auth-input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            <button className="auth-btn" onClick={handleSignIn} disabled={loading || !email || !password}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
            {error && <div className="auth-error">{error}</div>}
          </div>
        </div>
      </div>
    </>
  )
}
