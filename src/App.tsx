import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Review from './pages/Review'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/review/:id" element={<Review />} />
    </Routes>
  )
}
