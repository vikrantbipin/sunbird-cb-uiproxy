import crypto from 'crypto'
import express from 'express'
import querystring from 'querystring'
import { v4 as uuidv4 } from 'uuid'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'

export const lookerDashboard = express.Router()

interface ILookerOptions {
  access_filters: Record<string, unknown>
  embed_url: string
  external_user_id: string
  force_logout_login: boolean
  group_ids: string[]
  host: string
  models: string[]
  permissions: string[]
  secret: string
  session_length: number
  user_attributes: Record<string, string>
  first_name: string
}

lookerDashboard.post('/*', async (req, res) => {

  // Check if the request body is present and contains the required data
  if (!req.body.request) {
    return res.status(400).json({ error: 'Request body is missing or invalid' })
  }

  const { embedUrl, sessionLengthInSec, userAttributes,  userPermissions, userModels, userGroupIds} = req.body.request

  if (!userAttributes || Object.keys(userAttributes).length === 0) {
    return res.status(400).json({ error: 'userAttributes are required and cannot be empty' })
  }

  let embedUrlInfo
  let sessionTimeoutLength
  let firstName
  let userPermissionParam: string[]
  let userModelsParam: string[]
  let userGroupIdsParam: string[]

  // Check if userId is present within userAttributes
  const userId = userAttributes.userId
  if (!userId) {
    return res.status(400).json({ error: 'userId is missing in userAttributes' })
  }

  if (embedUrl) {
    embedUrlInfo = embedUrl
  } else {
     return res.status(400).json({ error: 'embedUrl is are required and cannot be empty' })
  }

  if (sessionLengthInSec) {
    sessionTimeoutLength = sessionLengthInSec
  } else {
    sessionTimeoutLength = CONSTANTS.LOOKER_SESSION_LENGTH
  }

  const name = userAttributes.firstName
  if (name) {
    firstName = name
  } else {
    firstName = CONSTANTS.LOOKER_DEFAULT_USER_NAME
  }

  if (userPermissions) {
      if (!Array.isArray(userPermissions)) {
          return res.status(400).json({ error: 'userPermissions should be array' })
      }
      userPermissionParam = userPermissions
  } else {
    userPermissionParam = CONSTANTS.LOOKER_USER_DASHBOARD_PERMISSION.split(',')
  }

  if (userModels) {
      if (!Array.isArray(userModels)) {
          return res.status(400).json({ error: 'userModels should be array' })
      }
      userModelsParam = userModels
  } else {
    userModelsParam = CONSTANTS.LOOKER_USER_MODELS.split(',')
  }

  if (userGroupIds) {
      if (!Array.isArray(userGroupIds)) {
          return res.status(400).json({ error: 'userGroupIds should be array' })
      }
      userGroupIdsParam = userGroupIds
  } else {
    userGroupIdsParam = CONSTANTS.LOOKER_GROUP_IDS.split(',')
  }

  const lookerOptions: ILookerOptions = {
    access_filters: { fake_model: { id: 1 } },
    embed_url: embedUrlInfo,
    external_user_id: userId,
    first_name: firstName,
    force_logout_login: Boolean(CONSTANTS.LOOKER_FORCE_LOGOUT_LOGIN),
    group_ids:  userGroupIdsParam,
    host: CONSTANTS.LOOKER_HOST,
    models: userModelsParam,
    permissions: userPermissionParam,
    secret: CONSTANTS.LOOKER_SECRET,
    session_length:  sessionTimeoutLength,
    user_attributes: { user_id: userId },
  }

  try {
    res.header('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.header('Pragma', 'no-cache')
    res.header('Expires', '0')

    const signedUrl = createSignedEmbedUrl(lookerOptions)

    logInfo(`Generated Looker dashboard URL: ${signedUrl}`)
    return res.status(200).json({ signedUrl })
  } catch (err) {
    logError('Error generating Looker dashboard URL:', err)
    return res.status(500).json({ error: 'Failed to generate Looker dashboard URL' })
  }
})

function createSignedEmbedUrl(options: ILookerOptions): string {
  const {
    secret,
    host,
    external_user_id,
    first_name,
    group_ids,
    permissions,
    models,
    access_filters,
    user_attributes,
    session_length,
    embed_url,
    force_logout_login,
  } = options

  const nonce = () => {
    // Generate a UUID, remove hyphens, and take the first 16 characters
    return uuidv4().replace(/-/g, '').slice(0, 16)
  }

  const forceUnicodeEncoding = (str: string) => decodeURIComponent(encodeURIComponent(str))

  const embedPath = `/login/embed/${encodeURIComponent(embed_url)}`
  const time = Math.floor(Date.now() / 1000)
  const jsonNonce = nonce()

  const stringToSign = [
    host,
    embedPath,
    JSON.stringify(jsonNonce),
    JSON.stringify(time),
    JSON.stringify(session_length),
    JSON.stringify(external_user_id),
    JSON.stringify(permissions),
    JSON.stringify(models),
    JSON.stringify(group_ids),
    JSON.stringify(user_attributes),
    JSON.stringify(access_filters),
  ].join('\n')
  const signature = crypto
    .createHmac('sha1', secret)
    .update(forceUnicodeEncoding(stringToSign))
    .digest('base64')
    .trim()

  const queryParams = {
    access_filters: JSON.stringify(access_filters),
    external_user_id: JSON.stringify(external_user_id),
    first_name:  JSON.stringify(first_name),
    force_logout_login : JSON.stringify(force_logout_login),
    group_ids: JSON.stringify(group_ids),
    models: JSON.stringify(models),
    nonce: JSON.stringify(jsonNonce),
    permissions: JSON.stringify(permissions),
    session_length: JSON.stringify(session_length),
    signature,
    time : JSON.stringify(time),
    user_attributes: JSON.stringify(user_attributes),
  }

  logInfo(`queryParams : ${queryParams}`)
  return `https://${host}${embedPath}?${querystring.stringify(queryParams)}`
}
