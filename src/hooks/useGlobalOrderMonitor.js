// src/hooks/useGlobalOrderMonitor.js
import { useState, useEffect, useRef } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { firestore } from '../lib/firebase'

export const useGlobalOrderMonitor = (userRole) => {
  const [pendingOrders, setPendingOrders] = useState([])
  const [isBeeping, setIsBeeping] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const audioContextRef = useRef(null)
  const beepIntervalRef = useRef(null)
  const lastOrderCountRef = useRef(0)

  // Monitor pending orders globally
  useEffect(() => {
    if (userRole !== 'superuser') {
      console.log('🔕 Not a superuser, skipping order monitoring')
      return
    }

    console.log('🔔 Setting up global order monitor for superuser')

    const pendingOrdersQuery = query(
      collection(firestore, 'orders'),
      where('status', '==', 'pending')
    )

    const unsubscribe = onSnapshot(
      pendingOrdersQuery,
      (snapshot) => {
        const orders = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          timestamp: doc.data().timestamp?.toDate()
        }))

        console.log('📦 Pending orders updated:', orders.length)
        console.log('📦 Orders data:', orders)

        // Check if this is a new order (count increased)
        const newOrderCount = orders.length
        const previousCount = lastOrderCountRef.current

        if (newOrderCount > previousCount && previousCount > 0) {
          console.log('🆕 New order detected! Count:', previousCount, '->', newOrderCount)
        }

        lastOrderCountRef.current = newOrderCount
        setPendingOrders(orders)
      },
      (error) => {
        console.error('❌ Error monitoring orders:', error)
      }
    )

    return unsubscribe
  }, [userRole])

  // Start/stop beeping based on pending orders
  useEffect(() => {
    if (userRole !== 'superuser' || !soundEnabled) {
      if (isBeeping) {
        console.log('🔇 Stopping beep - not superuser or sound disabled')
        stopContinuousBeep()
      }
      return
    }

    if (pendingOrders.length > 0 && !isBeeping) {
      console.log('🔊 Starting continuous beep - pending orders detected:', pendingOrders.length)
      startContinuousBeep()
    } else if (pendingOrders.length === 0 && isBeeping) {
      console.log('🔇 Stopping beep - no pending orders')
      stopContinuousBeep()
    }
  }, [pendingOrders.length, isBeeping, userRole, soundEnabled])

  const createAudioContext = () => {
    try {
      // Close existing context first
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close()
      }

      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (!AudioContext) {
        console.error('🔇 AudioContext not supported in this browser')
        return false
      }

      audioContextRef.current = new AudioContext()
      console.log('🎵 AudioContext created successfully')
      return true
    } catch (error) {
      console.error('🔇 Error creating AudioContext:', error)
      return false
    }
  }

  const createBeepTone = () => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      console.error('🔇 AudioContext not available or closed')
      return null
    }

    try {
      const oscillator = audioContextRef.current.createOscillator()
      const gainNode = audioContextRef.current.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContextRef.current.destination)

      // Urgent beep sound - higher frequency for urgency
      oscillator.frequency.setValueAtTime(1200, audioContextRef.current.currentTime)
      oscillator.type = 'square'

      // Volume control - start at 0, ramp up, then fade out
      gainNode.gain.setValueAtTime(0, audioContextRef.current.currentTime)
      gainNode.gain.linearRampToValueAtTime(0.15, audioContextRef.current.currentTime + 0.05)
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioContextRef.current.currentTime + 0.4)

      return { oscillator, gainNode }
    } catch (error) {
      console.error('🔇 Error creating beep tone:', error)
      return null
    }
  }

  const playBeep = async () => {
    console.log('🔊 Attempting to play beep...')

    // Resume AudioContext if it's suspended (required by some browsers)
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      try {
        await audioContextRef.current.resume()
        console.log('🎵 AudioContext resumed')
      } catch (error) {
        console.error('🔇 Error resuming AudioContext:', error)
        return
      }
    }

    const beepTone = createBeepTone()
    if (!beepTone) {
      console.error('🔇 Failed to create beep tone')
      return
    }

    try {
      const { oscillator } = beepTone
      oscillator.start(audioContextRef.current.currentTime)
      oscillator.stop(audioContextRef.current.currentTime + 0.4)
      console.log('🔊 Beep played successfully')
    } catch (error) {
      console.error('🔇 Error playing beep:', error)
    }
  }

  const startContinuousBeep = async () => {
    if (isBeeping) {
      console.log('🔊 Already beeping, skipping start')
      return
    }

    if (!createAudioContext()) {
      console.error('🔇 Failed to create AudioContext')
      return
    }

    // Request user interaction for audio (required by modern browsers)
    if (audioContextRef.current.state === 'suspended') {
      console.log('🎵 AudioContext suspended, waiting for user interaction...')
      // The context will be resumed when the user interacts with the page
    }

    setIsBeeping(true)
    console.log('🔊 Starting continuous beep system')

    // Play immediate first beep
    await playBeep()

    // Continue beeping every 3 seconds (less aggressive than every 2 seconds)
    beepIntervalRef.current = setInterval(async () => {
      if (pendingOrders.length > 0 && soundEnabled) {
        await playBeep()
      } else {
        console.log('🔇 Stopping beep interval - no pending orders or sound disabled')
        stopContinuousBeep()
      }
    }, 3000)
  }

  const stopContinuousBeep = () => {
    console.log('🔇 Stopping continuous beep')
    setIsBeeping(false)

    if (beepIntervalRef.current) {
      clearInterval(beepIntervalRef.current)
      beepIntervalRef.current = null
      console.log('🔇 Beep interval cleared')
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close()
        audioContextRef.current = null
        console.log('🔇 AudioContext closed')
      } catch (error) {
        console.error('🔇 Error closing AudioContext:', error)
      }
    }
  }

  const toggleSound = () => {
    setSoundEnabled(!soundEnabled)
    console.log('🔊 Sound toggled:', !soundEnabled ? 'enabled' : 'disabled')
  }

  // Handle user interaction to enable audio (required by browsers)
  useEffect(() => {
    const handleUserInteraction = async () => {
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        try {
          await audioContextRef.current.resume()
          console.log('🎵 AudioContext resumed after user interaction')
        } catch (error) {
          console.error('🔇 Error resuming AudioContext after interaction:', error)
        }
      }
    }

    // Listen for any user interaction to enable audio
    const events = ['click', 'touchstart', 'keydown']
    events.forEach(event => {
      document.addEventListener(event, handleUserInteraction, { once: true })
    })

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleUserInteraction)
      })
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('🔄 Cleaning up global order monitor')
      stopContinuousBeep()
    }
  }, [])

  // Debug logging
  useEffect(() => {
    if (userRole === 'superuser') {
      console.log('🔊 Global Order Monitor Status:', {
        pendingOrderCount: pendingOrders.length,
        isBeeping,
        soundEnabled,
        userRole,
        audioContextState: audioContextRef.current?.state || 'none'
      })
    }
  }, [pendingOrders.length, isBeeping, soundEnabled, userRole])

  return {
    pendingOrders,
    pendingOrderCount: pendingOrders.length,
    isBeeping,
    soundEnabled,
    stopBeeping: stopContinuousBeep,
    startBeeping: startContinuousBeep,
    toggleSound
  }
}
