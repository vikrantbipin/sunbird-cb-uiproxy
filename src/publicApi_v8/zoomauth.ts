import express from 'express'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'
const crypto = require('crypto')

export const zoomAuth = express.Router()

zoomAuth.post('/callback', async (req, res) => {
    let response

    logInfo('Received zoom callback. headers: ' + JSON.stringify(req.headers))
    logInfo('Received zoom request body: ' + JSON.stringify(req.body))

  // construct the message string
    const message = `v0:${req.headers['x-zm-request-timestamp']}:${JSON.stringify(req.body)}`

    const hashForVerify = crypto.createHmac('sha256', CONSTANTS.ZOOM_WEBHOOK_SECRET_TOKEN).update(message).digest('hex')

  // hash the message string with your Webhook Secret Token and prepend the version semantic
    const signature = `v0=${hashForVerify}`

  // you validating the request came from
  // Zoom https://marketplace.zoom.us/docs/api-reference/webhook-reference#notification-structure
    if (req.headers['x-zm-signature'] === signature) {

    // Zoom validating you control the webhook endpoint
    // https://marketplace.zoom.us/docs/api-reference/webhook-reference#validate-webhook-endpoint
    if (req.body.event === 'endpoint.url_validation') {
      const hashForValidate = crypto.createHmac('sha256',
        CONSTANTS.ZOOM_WEBHOOK_SECRET_TOKEN).update(req.body.payload.plainToken).digest('hex')

      response = {
        message: {
            encryptedToken: hashForValidate,
            plainToken: req.body.payload.plainToken,
        },
        status: 200,
      }

      logInfo('' + JSON.stringify(response.message))

      res.status(response.status)
      res.json(response.message)
    } else {
      response = { message: 'Authorized request to Zoom Webhook sample.', status: 200 }

      logInfo('' + response.message)

      res.status(response.status)
      res.json(response)

      // Add more logic here
    }
  } else {
    response = { message: 'Unauthorized request to Zoom Webhook sample.', status: 401 }

    logError(response.message)

    res.status(response.status)
    res.json(response)
  }
})
