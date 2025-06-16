import React from 'react';
import { Phone, MessageCircle, Instagram, Facebook, Mail, MapPin, Clock } from 'lucide-react';
import './Contacts.css';
import Legno from '/images/Legno.png';
import DandyLogo from '/images/Dandy.jpeg';
import Nav from '../components/Nav';

export default function Contacts() {
  return (
    <div className="contacts-wrapper" style={{ backgroundImage: `url(${Legno})` }}>
      <div className="contacts-overlay"></div>

      <Nav />

      <div className="contacts-content">
        {/* Logo at the top */}
        <div className="contacts-logo">
          <img src={DandyLogo} alt="Dandy Caffè" className="logo-image" />
        </div>

        {/* Clickable contact cards with icons - 2x2 grid */}
        <div className="contact-grid">
          <a
            href="tel:+390803713173"
            className="contact-card clickable-card"
            aria-label="Chiama il telefono fisso"
          >
            <Phone className="contact-icon" size={24} />

            <span className="contact-value">080 3713173</span>
          </a>

          <a
            href="https://wa.me/393927249845"
            target="_blank"
            rel="noopener noreferrer"
            className="contact-card clickable-card"
            aria-label="Apri chat WhatsApp"
          >
            <MessageCircle className="contact-icon" size={24} />
            <span className="contact-value">+39 392 724 9845</span>
          </a>

          <a
            href="https://www.instagram.com/dandycaffe/?hl=en"
            target="_blank"
            rel="noopener noreferrer"
            className="contact-card clickable-card"
            aria-label="Visita il profilo Instagram"
          >
            <Instagram className="contact-icon" size={24} />
            <span className="contact-value">@dandycaffe</span>
          </a>

          <a
            href="https://www.facebook.com/p/Dandy-Caff%C3%A8-100063616448651/"
            target="_blank"
            rel="noopener noreferrer"
            className="contact-card clickable-card"
            aria-label="Visita la pagina Facebook"
          >
            <Facebook className="contact-icon" size={24} />
            <span className="contact-value">Dandy Caffè</span>
          </a>

          <a
            href="mailto:Dandycaffe@libero.it"
            className="contact-card clickable-card"
            aria-label="Invia email"
          >
            <Mail className="contact-icon" size={24} />

            <span className="contact-value">Dandycaffe@libero.it</span>
          </a>
        </div>

        {/* Location and Hours - Full width cards */}
        <div className="info-cards">
          <a
            href="https://maps.google.com/?q=Via+Generale+Francesco+Planelli,+60,+70032+Bitonto+(BA),+Italia"
            target="_blank"
            rel="noopener noreferrer"
            className="contact-card info-card clickable-card"
            aria-label="Apri in Google Maps"
          >
            <MapPin className="contact-icon" size={24} />
            <span className="contact-label">Indirizzo</span>
            <span className="contact-value">
              Via Generale Francesco Planelli, 60, 70032 Bitonto (BA), Italia
            </span>
          </a>

          <div className="contact-card info-card">
            <Clock className="contact-icon" size={24} />
            <span className="contact-label">Orari di Apertura</span>
            <span className="contact-value">
              Lun – Sab: 06:00 – 21:00<br />
              Dom & Fest: 06:00 – 13:00
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
