import axios from 'axios'
import express from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { getCurrnetExpiryTime } from '../utils/jwtHelper'
import { logError, logInfo } from '../utils/logger'
import { createUserWithMailId, fetchUserByEmailId, updateKeycloakSession } from './ssoUserHelper'

export const parichayAuth = express.Router()

parichayAuth.get('/auth', async (req, res) => {
    logInfo('Received host : ' + req.hostname)
    const redirectUrl = 'https://' + req.hostname + CONSTANTS.PARICHAY_AUTH_CALLBACK_URL
    let oAuthParams = 'client_id=' + CONSTANTS.PARICHAY_CLIENT_ID
    oAuthParams = oAuthParams + '&redirect_uri=' + redirectUrl
    oAuthParams = oAuthParams + '&response_type=code&scope=user_details'
    oAuthParams = oAuthParams + '&code_challenge=' + CONSTANTS.PARICHAY_CODE_CHALLENGE
    oAuthParams = oAuthParams + '&code_challenge_method=S256'
    const parichayUrl = CONSTANTS.PARICHAY_AUTH_URL + '?' + oAuthParams
    res.redirect(parichayUrl)
})

parichayAuth.get('/callback', async (req, res) => {
    const host = req.get('host')
    if (!req.query.code) {
        logInfo('Received host : ' + host)
        logError('Failed to login in Parichay, authorization code is missing. Redirecting to /error')
        const errorMessage = 'Failed to login using Parichay. Your Parichay session has expired.'
                          + ' Please logoff from Parichay and retry [Login with Parichay] option on iGOT Portal Login page.'
                          + ' If issue persists, then please try the same in incognito/private window.'
        res.redirect(`https://${host}/public/logout?error=` + encodeURIComponent(errorMessage))
        return
    }
    let resRedirectUrl = `https://${host}/page/home`
    try {
        const redirectUrl = 'https://' + req.hostname + CONSTANTS.PARICHAY_AUTH_CALLBACK_URL
        const tokenResponse = await axios({
            ...axiosRequestConfig,
            data: {
                client_id: CONSTANTS.PARICHAY_CLIENT_ID,
                client_secret: CONSTANTS.PARICHAY_CLIENT_SECRET,
                code: decodeURIComponent(req.query.code),
                // tslint:disable-next-line: max-line-length
                code_verifier: CONSTANTS.PARICHAY_CODE_VERIFIER,
                grant_type: 'authorization_code',
                redirect_uri: redirectUrl,
            },
            method: 'POST',
            url: CONSTANTS.PARICHAY_TOKEN_URL,
        })
        if (req.session) {
            req.session.parichayToken = tokenResponse.data
            req.session.cookie.expires = new Date(getCurrnetExpiryTime(tokenResponse.data.access_token))
            logInfo('Parichay Token is set in request Session.' + tokenResponse.data.access_token)
        } else {
            logError('Failed to set Parichay token in req session. Session not available...')
        }
        const userDetailResponse = await axios({
            ...axiosRequestConfig,
            headers: {
                Authorization: tokenResponse.data.access_token,
            },
            method: 'GET',
            url: CONSTANTS.PARICHAY_USER_DETAILS_URL,
        })

        logInfo('User information from Parichay : ' + JSON.stringify(userDetailResponse.data))
        const loginId = userDetailResponse.data.loginId
        if (!loginId) {
          const errorMessage = 'iGOT login failed. You must allow Email id on the consent form for Login. '
            + 'Please logout from Parichay and try iGOT Login with Parichay again.'
          // Redirect to the logout page with an error message
          res.redirect(`https://${host}/public/logout?error=` + encodeURIComponent(errorMessage))
          return
        }

        let result: { errMessage: string, rootOrgId: string, userExist: boolean, }
        result =  await fetchUserByEmailId(userDetailResponse.data.loginId)
        logInfo('For Parichay emailId ? ' + userDetailResponse.data.loginId + ', isUserExist ? ' + result.userExist
          + ', rootOrgId ? ' + result.rootOrgId + ', errorMessage ? ' + result.errMessage)
        let isFirstTimeUser = false
        if (result.errMessage === '') {
            let createResult: { errMessage: string, userCreated: boolean, userId: string }
            if (!result.userExist) {
                logInfo('iGOT User does not exist for Parichay email: ' + userDetailResponse.data.loginId)
                const mobileNo = userDetailResponse.data.MobileNo

                if (!loginId || !mobileNo) {
                   const errorMessage = 'Parichay user registration failed. You must allow Email id and Mobile number on the consent form. '
                          + 'Please logout from Parichay and try iGOT Login with Parichay again.'
                    // Redirect to the logout page with an error message
                   res.redirect(`https://${host}/public/logout?error=` + encodeURIComponent(errorMessage))
                   return
                }
                createResult = await createUserWithMailId(userDetailResponse.data.loginId,
                    userDetailResponse.data.FirstName, userDetailResponse.data.LastName, userDetailResponse.data.MobileNo)
                if (createResult.errMessage !== '') {
                    result.errMessage = createResult.errMessage
                }
                isFirstTimeUser = true
                logInfo('New user is created for Parichay email id:' + userDetailResponse.data.loginId
                  + ', new User id:' + createResult.userId)
            } else {
                logInfo('User exists for Parichay email id:' + userDetailResponse.data.loginId
                  + ', result.rootOrgId = ' + result.rootOrgId + ', XChannelId = ' + CONSTANTS.X_Channel_Id)
                if (result.rootOrgId !== '' && result.rootOrgId === CONSTANTS.X_Channel_Id) {
                    isFirstTimeUser = true
                }
            }
            if (result.errMessage === '') {
                let keycloakResult: {
                    access_token: string, errMessage: string, keycloakSessionCreated: boolean, refresh_token: string
                }
                keycloakResult = await updateKeycloakSession(userDetailResponse.data.loginId, req, res)
                if (keycloakResult.errMessage !== '') {
                  logError('For Parichay emailId:' + userDetailResponse.data.loginId
                    + ', Received a keycloak error: ' + keycloakResult.errMessage)
                  result.errMessage = keycloakResult.errMessage
                }
            }
        }
        if (result.errMessage !== '') {
            logError('For Parichay emailId:' + userDetailResponse.data.loginId
              + ', Received error from user search. Error Message: ' + result.errMessage)
            resRedirectUrl = `https://${host}/public/logout?error=` + encodeURIComponent(JSON.stringify(result.errMessage))
        } else {
          logInfo('Parichay login is successful for emailId:' + userDetailResponse.data.loginId)
          if (isFirstTimeUser) {
              resRedirectUrl = `https://${host}/public/welcome`
            }
        }
    } catch (err) {
        logError('Failed to process callback API for Parichay code : ' + req.query.code + '..with the error: ' + JSON.stringify(err))
        resRedirectUrl = `https://${host}/public/logout?error=` + encodeURIComponent('Internal Server Error. Please contact administrator.')
    }
    res.redirect(resRedirectUrl)
})
