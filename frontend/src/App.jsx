import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import CreateSurvey from './pages/CreateSurvey.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Survey from './pages/Survey.jsx';
import AdminSurveys from './pages/AdminSurveys.jsx';
import Gallery from './pages/Gallery.jsx';
import About from './pages/About.jsx';
import ClubNews from './pages/ClubNews.jsx';
import AdminNews from './pages/AdminNews.jsx';
import Marketplace from './pages/Marketplace.jsx';
import AdminMarketplace from './pages/AdminMarketplace.jsx';
import PaintingCompetition from './pages/PaintingCompetition.jsx';
import AdminPaintingCompetition from './pages/AdminPaintingCompetition.jsx';
import AdminGuestAccess from './pages/AdminGuestAccess.jsx';
import OnamSchedule from './pages/OnamSchedule.jsx';
import AdminOnamSchedule from './pages/AdminOnamSchedule.jsx';
import AdminGallery from './pages/AdminGallery.jsx';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/member-application-preview-2026" element={<Register previewMode />} />
      <Route path="/gallery" element={<Gallery />} />
      <Route path="/about" element={<About />} />
      <Route path="/club-news" element={<ClubNews />} />
      <Route path="/club-news/:slug" element={<ClubNews />} />
      <Route path="/marketplace" element={<Marketplace />} />
      <Route path="/marketplace/:slug" element={<Marketplace />} />
      <Route path="/onam-painting-competition" element={<PaintingCompetition />} />
      <Route path="/onam-painting-competition/submit" element={<PaintingCompetition submissionMode />} />
      <Route path="/onam-2026" element={<OnamSchedule />} />
      <Route path="/create-survey" element={<CreateSurvey />} />
      <Route path="/admin/surveys/new" element={<CreateSurvey adminMode />} />
      <Route path="/admin/surveys/:id/edit" element={<CreateSurvey adminMode editMode />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/survey/:id" element={<Survey />} />
      <Route path="/admin/surveys" element={<AdminSurveys />} />
      <Route path="/admin/news" element={<AdminNews />} />
      <Route path="/admin/marketplace" element={<AdminMarketplace />} />
      <Route path="/admin/gallery" element={<AdminGallery />} />
      <Route path="/admin/painting-competition" element={<AdminPaintingCompetition />} />
      <Route path="/admin/guest-access" element={<AdminGuestAccess />} />
      <Route path="/admin/onam-schedule" element={<AdminOnamSchedule />} />
    </Routes>
  );
}

export default App;
