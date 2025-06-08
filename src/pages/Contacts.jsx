import React from 'react'
import './Contacts.css'
import Legno from '/images/Legno.png'
import Nav from '../components/Nav'

export default function Contacts() {
  return (
    <div className="contacts-wrapper" style={{ backgroundImage: `url(${Legno})` }}>
      <div className="contacts-overlay"></div>

      <Nav />

      <div className="contacts-content">
        {/* <h1 className="contacts-title">Contatti</h1> */}

        <div className="contact-card">
          <span className="contact-label">Telefono Fisso</span>
          <span className="contact-value">
            <a href="tel:+390803713173">080 3713173</a>
          </span>
        </div>

        <div className="contact-card">
          <span className="contact-label">WhatsApp</span>
          <span className="contact-value">
            <a
              href="https://wa.me/393927249845"
              target="_blank"
              rel="noopener noreferrer"
            >
              +39 392 724 9845
            </a>
          </span>
        </div>

        <div className="contact-card">
          <span className="contact-label">Instagram</span>
          <span className="contact-value">
            <a href="https://www.instagram.com/dandycaffe/?hl=en" target="_blank" rel="noopener noreferrer">
              @dandycaffe
            </a>
          </span>
        </div>

        <div className="contact-card">
          <span className="contact-label">Facebook</span>
          <span className="contact-value">
            <a href="https://www.facebook.com/p/Dandy-Caff%C3%A8-100063616448651/" target="_blank" rel="noopener noreferrer">
              Dandy Caffè
            </a>
          </span>
        </div>

        <div className="contact-card">
          <span className="contact-label">Email</span>
          <span className="contact-value">
            <a href="mailto:Dandycaffe@libero.it">Dandycaffe@libero.it</a>
          </span>
        </div>

        <div className="contact-card">
          <span className="contact-label">Indirizzo</span>
          <span className="contact-value">
            <a
              href="https://maps.google.com/?q=Via+Generale+Francesco+Planelli,+60,+70032+Bitonto+(BA),+Italia"
              target="_blank"
              rel="noopener noreferrer"
            >
              Via Generale Francesco Planelli, 60, 70032 Bitonto (BA), Italia
            </a>
          </span>
        </div>

        <div className="contact-card">
          <span className="contact-label">Orari di Apertura</span>
          <span className="contact-value">
            Lunedì – Sabato: 06:00 – 21:00<br />
            Domenica e Festivi: 06:00 – 13:00
          </span>
        </div>
      </div>
    </div>
  )
}
