import { Routes, Route } from 'react-router-dom'
import Landing from './pages/Landing'
import Guide from './pages/Guide'
import Home from './pages/Home'
import Review from './pages/Review'
import Export from './pages/Export'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/guide" element={<Guide />} />
      <Route path="/app" element={<Home />} />
      <Route path="/review/:id" element={<Review />} />
      <Route path="/export" element={<Export />} />
    </Routes>
  )
}
