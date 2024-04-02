import axios from 'axios'
import express from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'

export const youtubePlaylist = express.Router()

youtubePlaylist.get('/landingpage', async (req, res) => {
    const playListIds = CONSTANTS.YOUTUBE_PLAYLIST_NAMES.split(',')
    const playlistDataMap = {}

    for (const playListId of playListIds) {
        let playListUrl = CONSTANTS.YOUTUBE_PLAYLIST_URL
        playListUrl += '?key=' + CONSTANTS.YOUTUBE_PLAYLIST_API_KEY
        playListUrl += '&playlistId=' + CONSTANTS[playListId]
        playListUrl += '&part=snippet,id,contentDetails'
        playListUrl += '&maxResults=' + (Number(req.query.maxResults) || Number(CONSTANTS.YOUTUBE_PLAYLIST_MAX_RESULT))
        logInfo('Youtube playlist constructed url : ' + playListUrl)
        const keyValue = playListId
        try {
            const playlistResponse = await axios({
                ...axiosRequestConfig,
                method: 'GET',
                url: playListUrl,
            })
            if (!playlistResponse.data) {
                playlistDataMap[keyValue] = {}
            } else {
                playlistDataMap[keyValue] = playlistResponse.data
            }
        } catch (err) {
            playlistDataMap[keyValue] = {}
            logError('Failed to read playlist for Id : ' + playListId)
        }
    }
    res.status(200).json(playlistDataMap)
})
