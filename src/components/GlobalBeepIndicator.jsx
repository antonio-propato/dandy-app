// src/components/GlobalBeepIndicator.jsx
import React from 'react'
import { useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faBell,
  faVolumeUp,
  faExclamationTriangle,
  faClipboardList
} from '@fortawesome/free-solid-svg-icons'
import './GlobalBeepIndicator.css'

const GlobalBeepIndicator = ({
  pendingOrderCount,
  isBeeping,
  stopBeeping,
  userRole
}) => {
  const navigate = useNavigate()

  if (userRole !== 'superuser' || pendingOrderCount === 0) {
    return null
  }

  const handleViewOrders = () => {
    navigate('/orders')
  }

  const handleMuteBeeping = () => {
    stopBeeping()
  }

  return (
    <div className={`global-beep-indicator ${isBeeping ? 'beeping' : ''}`}>
      <div className="beep-indicator-content">
        <div className="beep-indicator-icon">
          <FontAwesomeIcon
            icon={faExclamationTriangle}
            className={`warning-icon ${isBeeping ? 'pulsing' : ''}`}
          />
        </div>

        <div className="beep-indicator-text">
          <div className="beep-indicator-title">
            {pendingOrderCount} Nuovi Ordini!
          </div>
          <div className="beep-indicator-subtitle">
            {isBeeping ? 'Beeping attivo' : 'Audio disattivato'}
          </div>
        </div>

        <div className="beep-indicator-actions">
          <button
            onClick={handleViewOrders}
            className="beep-action-btn primary"
            title="Visualizza ordini"
          >
            <FontAwesomeIcon icon={faClipboardList} />
          </button>

          {isBeeping && (
            <button
              onClick={handleMuteBeeping}
              className="beep-action-btn secondary"
              title="Disattiva audio"
            >
              <FontAwesomeIcon icon={faVolumeUp} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default GlobalBeepIndicator
