import React from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'atomic-router-react'
import App from './App'
import { router, history } from './shared/routing'
import { checkSession, startAuthSyncFx } from './entities/model'
import 'antd/dist/reset.css'

// 1. Set the history for the router
router.setHistory(history)

checkSession()
startAuthSyncFx()

const root = createRoot(document.getElementById('root') as HTMLElement)
root.render(
  <React.StrictMode>
    <RouterProvider router={router}>
      <App />
    </RouterProvider>
  </React.StrictMode>
)

