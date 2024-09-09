import axios, { Method } from 'axios'
import express from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'
import { extractUserIdFromRequest, extractUserToken } from '../utils/requestExtract'

export const frameworksApi = express.Router()
const _ = require('lodash')

frameworksApi.use('/*', async (req, res) => {
  try {
    const url = removePrefix('/proxies/v8', req.originalUrl)
    logInfo(`The url is... ${url} : rootOrgId: ${req.originalUrl}`)
    const userRoleData = _.get(req, 'session.userRoles')
    const userRootOrgId = _.get(req, 'session.rootOrgId')
    logInfo(`Framework API call: Users Roles are... ${userRoleData} : rootOrgId: ${userRootOrgId}`)

    const masterFrameworkCategory = CONSTANTS.FRAMEWORK_ALLOWED_UPDATE_CATEGORY.split(',')
    const allowedRoles = CONSTANTS.FRAMEWORK_MASTER_ALLOWED_UPDATE_ROLE.split(',')

    let orgId

    if (url.includes('/publish/')) {
      orgId = extractPublishId(url)
    } else if (url.includes('/create/') || url.includes('/update/')) {
      orgId = extractFrameworkId(url)
    } else {
      // Handle other requests outside of create/update/publish
      await sendFrameworkAPIRequest(req, res, url, userRootOrgId)
      return
    }

    if (url.includes('/publish/') || url.includes('/create/') || url.includes('/update/')) {
      logInfo(`The value is ${orgId}`)
      if (orgId && masterFrameworkCategory.includes(orgId)) { // To check the value from masterFrameworkCategory
          const hasRole = userRoleData.some((role: string) => allowedRoles.includes(role))
          if (!hasRole) {
            return res.status(401).send('User does not have the required role to update the framework')
          }
      } else if (orgId && orgId !== userRootOrgId) {
        return res.status(401).send(`You are not authorized to perform the action for org: ${userRootOrgId}`)
      }
    }

    // Proceed with the API request if all conditions are met
    await sendFrameworkAPIRequest(req, res, url, userRootOrgId)
    return

  } catch (err) {
    logError(`Framework API call failed: ${err.message}`)
    return res.status(500).send(err.message)
  }
})

const extractFrameworkId = (url: string): string => {
  const urlParams = new URLSearchParams(url.split('?')[1])
  const framework = urlParams.get('framework')

  if (framework) {
    const parts = framework.split('_')
    return parts.length > 1 && !isNaN(Number(parts[0])) ? parts[0] : framework
  }
  return ''
}

// Function to handle publish URL and extract the ID
const extractPublishId = (url: string): string => {
  const publishMatch = url.match(/\/publish\/([^/]+)/)
  if (publishMatch && publishMatch[1]) {
    const publishId = publishMatch[1]
    const parts = publishId.split('_')
    return parts.length > 1 && !isNaN(Number(parts[0])) ? parts[0] : publishId
  }
  return ''
}

const sendFrameworkAPIRequest = async (req: express.Request, res: express.Response, url: string, userRootOrgId: string) => {
  try {
    logInfo(`sendFrameworkAPIRequest the url is... ${CONSTANTS.KONG_API_BASE}${url}}`)
    const method: Method = req.method as Method
    logInfo(method)
    const response = await axios({
      ...axiosRequestConfig,
      data: req.body,
      headers: {
        Authorization: CONSTANTS.SB_API_KEY,
        'X-Channel-Id': userRootOrgId,
        'x-authenticated-user-id': extractUserIdFromRequest(req),
        'x-authenticated-user-orgid': userRootOrgId,
        'x-authenticated-user-token': extractUserToken(req),
      },
      method,
      url: `${CONSTANTS.KONG_API_BASE}${url}`,
    })

    res.status(response.status).send(response.data)
  } catch (err) {
    logError(`API call failed: ${err.message}`)
    res.status(500).send(err.message)
  }
}

function removePrefix(prefix: string, s: string): string {
  return s.startsWith(prefix) ? s.substring(prefix.length) : s
}
