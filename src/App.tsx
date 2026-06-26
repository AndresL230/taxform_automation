import { Routes, Route } from 'react-router-dom'
import Landing from './pages/Landing'
import Guide from './pages/Guide'
import Home from './pages/Home'
import Review from './pages/Review'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/guide" element={<Guide />} />
      <Route path="/app" element={<Home />} />
      <Route path="/review/:id" element={<Review />} />
    </Routes>
  )
}
