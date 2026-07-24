import { supabase } from './supabaseClient.js'

const authScreen = document.getElementById('auth-screen')
const chatScreen = document.getElementById('chat-screen')

const authForm = document.getElementById('auth-form')
const authDisplayNameInput = document.getElementById('auth-display-name')
const authEmailInput = document.getElementById('auth-email')
const authPasswordInput = document.getElementById('auth-password')
const authSubmitBtn = document.getElementById('auth-submit')
const authErrorEl = document.getElementById('auth-error')
const authToggleModeBtn = document.getElementById('auth-toggle-mode')

const logoutBtn = document.getElementById('logout-btn')
const sidebarEl = document.getElementById('sidebar')
const sidebarBackdropEl = document.getElementById('sidebar-backdrop')
const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn')
const channelListEl = document.getElementById('channel-list')
const newChannelForm = document.getElementById('new-channel-form')
const newChannelInput = document.getElementById('new-channel-input')
const memberListEl = document.getElementById('member-list')

const currentChannelNameEl = document.getElementById('current-channel-name')
const messageListEl = document.getElementById('message-list')
const replyBarEl = document.getElementById('reply-bar')
const replyBarText = document.getElementById('reply-bar-text')
const replyBarCancel = document.getElementById('reply-bar-cancel')
const messageForm = document.getElementById('message-form')
const messageInput = document.getElementById('message-input')

const profileModalOverlay = document.getElementById('profile-modal-overlay')
const profileModalClose = document.getElementById('profile-modal-close')
const profileModalAvatar = document.getElementById('profile-modal-avatar')
const profileModalName = document.getElementById('profile-modal-name')
const profileModalEditBtn = document.getElementById('profile-modal-edit-btn')
const profileModalJoined = document.getElementById('profile-modal-joined')
const profileModalPlaylistRow = document.getElementById('profile-modal-playlist-row')
const profileModalPlaylistVal = document.getElementById('profile-modal-playlist-val')
const profileModalPlaylistEditBtn = document.getElementById('profile-modal-playlist-edit-btn')

let authMode = 'login'
let channels = []
let activeChannelId = null
let profilesById = new Map()
let realtimeMessagesSub = null
let realtimeReactionsSub = null
let currentUserId = null
let replyToMessage = null
let reactionsMap = new Map()
let lastReadAt = new Map()
let unreadChannels = new Set()

function showAuthScreen() {
  authScreen.classList.remove('hidden')
  chatScreen.classList.add('hidden')
}

function showChatScreen() {
  authScreen.classList.add('hidden')
  chatScreen.classList.remove('hidden')
}

function setAuthMode(mode) {
  authMode = mode
  authErrorEl.textContent = ''
  if (mode === 'signup') {
    authDisplayNameInput.classList.remove('hidden')
    authDisplayNameInput.required = true
    authSubmitBtn.textContent = 'Sign up'
    authToggleModeBtn.textContent = 'Already have an account? Log in'
  } else {
    authDisplayNameInput.classList.add('hidden')
    authDisplayNameInput.required = false
    authSubmitBtn.textContent = 'Log in'
    authToggleModeBtn.textContent = "Need an account? Sign up"
  }
}

authToggleModeBtn.addEventListener('click', () => {
  setAuthMode(authMode === 'login' ? 'signup' : 'login')
})

authForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  authErrorEl.textContent = ''

  const email = authEmailInput.value.trim()
  const password = authPasswordInput.value

  if (authMode === 'signup') {
    const displayName = authDisplayNameInput.value.trim()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    })
    if (error) {
      authErrorEl.textContent = error.message
      return
    }
    if (!data.session) {
      authErrorEl.textContent = 'Check your email to confirm your account, then log in.'
      setAuthMode('login')
    }
  } else {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      authErrorEl.textContent = error.message
    }
  }
})

function openSidebar() {
  sidebarEl.classList.add('open')
  sidebarBackdropEl.classList.remove('hidden')
}

function closeSidebar() {
  sidebarEl.classList.remove('open')
  sidebarBackdropEl.classList.add('hidden')
}

sidebarToggleBtn.addEventListener('click', () => {
  sidebarEl.classList.contains('open') ? closeSidebar() : openSidebar()
})

sidebarBackdropEl.addEventListener('click', closeSidebar)

logoutBtn.addEventListener('click', async () => {
  await supabase.auth.signOut()
})

function formatTimestamp(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function hashString(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0
  return Math.abs(hash)
}

function getAvatarColor(seed) {
  const hue = hashString(seed) % 360
  return `hsl(${hue}, 60%, 45%)`
}

function getInitials(name) {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

let profileModalUserId = null
let cancelProfileNameEdit = null
let cancelProfilePlaylistEdit = null

function updatePlaylistDisplay(profile) {
  profileModalPlaylistVal.textContent = profile.youtube_playlist_id ? '✓ Playlist set' : 'No playlist set'
}

function openProfileModal(userId) {
  const profile = profilesById.get(userId)
  if (!profile) return

  cancelProfileNameEdit?.()
  cancelProfilePlaylistEdit?.()
  profileModalUserId = userId
  profileModalAvatar.style.background = getAvatarColor(userId)
  profileModalAvatar.textContent = getInitials(profile.display_name)
  profileModalName.textContent = profile.display_name
  profileModalJoined.textContent = `Joined ${new Date(profile.created_at).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })}`
  const isOwnProfile = userId === currentUserId
  profileModalEditBtn.classList.toggle('hidden', !isOwnProfile)
  profileModalPlaylistRow.classList.toggle('hidden', !isOwnProfile)
  if (isOwnProfile) updatePlaylistDisplay(profile)
  profileModalOverlay.classList.remove('hidden')
}

function closeProfileModal() {
  cancelProfileNameEdit?.()
  cancelProfilePlaylistEdit?.()
  profileModalOverlay.classList.add('hidden')
}

async function renameDisplayName(newName) {
  const { error } = await supabase.from('profiles').update({ display_name: newName }).eq('id', currentUserId)
  if (error) {
    alert(`Couldn't update display name: ${error.message}`)
    return
  }

  const profile = profilesById.get(currentUserId)
  if (profile) profile.display_name = newName
  profileModalName.textContent = newName
  profileModalAvatar.textContent = getInitials(newName)
  renderMemberList()
}

function startEditingProfileName() {
  const profile = profilesById.get(profileModalUserId)
  if (!profile) return

  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'profile-modal-name-input'
  input.value = profile.display_name
  profileModalName.replaceWith(input)
  input.focus()
  input.select()

  let settled = false
  const finish = async (save) => {
    if (settled) return
    settled = true
    cancelProfileNameEdit = null
    input.replaceWith(profileModalName)

    if (save) {
      const newName = input.value.trim()
      if (newName && newName !== profile.display_name) {
        await renameDisplayName(newName)
      }
    }
  }

  cancelProfileNameEdit = () => finish(false)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true)
    if (e.key === 'Escape') finish(false)
  })
  input.addEventListener('blur', () => finish(true))
}

function extractPlaylistId(input) {
  const trimmed = input.trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed)
    if (url.hostname.endsWith('youtube.com')) {
      const list = url.searchParams.get('list')
      if (list) return list
    }
  } catch {
    // not a URL — treat as raw ID
  }
  return trimmed
}

async function savePlaylistId(rawInput) {
  const playlistId = extractPlaylistId(rawInput)
  const { error } = await supabase
    .from('profiles')
    .update({ youtube_playlist_id: playlistId })
    .eq('id', currentUserId)
  if (error) { alert(`Couldn't save playlist: ${error.message}`); return }
  const profile = profilesById.get(currentUserId)
  if (profile) {
    profile.youtube_playlist_id = playlistId
    updatePlaylistDisplay(profile)
  }
}

function startEditingPlaylist() {
  const profile = profilesById.get(profileModalUserId)
  if (!profile) return

  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'profile-modal-playlist-input'
  input.placeholder = 'Paste YouTube playlist URL'
  input.value = profile.youtube_playlist_id || ''
  profileModalPlaylistVal.replaceWith(input)
  input.focus()
  input.select()

  let settled = false
  const finish = async (save) => {
    if (settled) return
    settled = true
    cancelProfilePlaylistEdit = null
    input.replaceWith(profileModalPlaylistVal)
    if (save) await savePlaylistId(input.value)
  }

  cancelProfilePlaylistEdit = () => finish(false)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true)
    if (e.key === 'Escape') finish(false)
  })
  input.addEventListener('blur', () => finish(true))
}

profileModalEditBtn.addEventListener('click', startEditingProfileName)
profileModalPlaylistEditBtn.addEventListener('click', startEditingPlaylist)
profileModalClose.addEventListener('click', closeProfileModal)
profileModalOverlay.addEventListener('click', (e) => {
  if (e.target === profileModalOverlay) closeProfileModal()
})

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡']

function loadLastRead() {
  try {
    const stored = JSON.parse(localStorage.getItem(`underthink:read:${currentUserId}`) || '{}')
    lastReadAt = new Map(Object.entries(stored))
  } catch {
    lastReadAt = new Map()
  }
}

function saveLastRead() {
  localStorage.setItem(`underthink:read:${currentUserId}`, JSON.stringify(Object.fromEntries(lastReadAt)))
}

function markChannelRead(channelId) {
  lastReadAt.set(channelId, new Date().toISOString())
  saveLastRead()
  if (unreadChannels.delete(channelId)) renderChannelList()
}

async function checkUnreadChannels() {
  const now = new Date().toISOString()
  const toCheck = channels.filter((ch) => {
    if (ch.id === activeChannelId) return false
    if (!lastReadAt.has(ch.id)) { lastReadAt.set(ch.id, now); return false }
    return true
  })
  if (toCheck.length > 0) {
    await Promise.all(toCheck.map(async (ch) => {
      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('channel_id', ch.id)
        .gt('created_at', lastReadAt.get(ch.id))
      if ((count || 0) > 0) unreadChannels.add(ch.id)
    }))
  }
  saveLastRead()
  renderChannelList()
}

function showReplyBar(message) {
  replyToMessage = message
  const senderName = profilesById.get(message.user_id)?.display_name || 'Unknown'
  const snippet = message.body.length > 60 ? message.body.slice(0, 60) + '…' : message.body
  replyBarText.textContent = `Replying to ${senderName}: ${snippet}`
  replyBarEl.classList.remove('hidden')
  messageInput.focus()
}

function clearReply() {
  replyToMessage = null
  replyBarEl.classList.add('hidden')
  replyBarText.textContent = ''
}

replyBarCancel.addEventListener('click', clearReply)

function renderReactions(messageId, emojiMap, container) {
  container.innerHTML = ''
  if (emojiMap) {
    for (const [emoji, { count, myReactionId }] of emojiMap) {
      const pill = document.createElement('button')
      pill.type = 'button'
      pill.className = myReactionId ? 'reaction-pill reaction-pill-mine' : 'reaction-pill'
      pill.textContent = `${emoji} ${count}`
      pill.addEventListener('click', (e) => { e.stopPropagation(); toggleReaction(messageId, emoji, myReactionId) })
      container.appendChild(pill)
    }
  }
  const addBtn = document.createElement('button')
  addBtn.type = 'button'
  addBtn.className = 'reaction-add-btn'
  addBtn.textContent = '＋'
  addBtn.title = 'Add reaction'
  addBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleEmojiPicker(messageId, container) })
  container.appendChild(addBtn)
}

function toggleEmojiPicker(messageId, container) {
  const existing = container.querySelector('.emoji-picker-inline')
  if (existing) { existing.remove(); return }
  document.querySelectorAll('.emoji-picker-inline').forEach((el) => el.remove())
  const pickerEl = document.createElement('div')
  pickerEl.className = 'emoji-picker-inline'
  REACTION_EMOJIS.forEach((emoji) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'emoji-picker-btn'
    btn.textContent = emoji
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      toggleReaction(messageId, emoji, reactionsMap.get(messageId)?.get(emoji)?.myReactionId ?? null)
      pickerEl.remove()
    })
    pickerEl.appendChild(btn)
  })
  container.appendChild(pickerEl)
}

document.addEventListener('click', () => {
  document.querySelectorAll('.emoji-picker-inline').forEach((el) => el.remove())
})

async function toggleReaction(messageId, emoji, myReactionId) {
  if (myReactionId) {
    const { error } = await supabase.from('reactions').delete().eq('id', myReactionId)
    if (error) alert(`Couldn't remove reaction: ${error.message}`)
  } else {
    const { error } = await supabase.from('reactions').insert({
      message_id: messageId,
      channel_id: activeChannelId,
      user_id: currentUserId,
      emoji,
    })
    if (error) alert(`Couldn't add reaction: ${error.message}`)
  }
}

function updateReactionsUI(messageId) {
  const container = messageListEl.querySelector(`[data-reactions-for="${messageId}"]`)
  if (container) renderReactions(messageId, reactionsMap.get(messageId) ?? null, container)
}

function handleReactionInsert(r) {
  if (!reactionsMap.has(r.message_id)) reactionsMap.set(r.message_id, new Map())
  const emojiMap = reactionsMap.get(r.message_id)
  if (!emojiMap.has(r.emoji)) emojiMap.set(r.emoji, { count: 0, myReactionId: null })
  const entry = emojiMap.get(r.emoji)
  entry.count++
  if (r.user_id === currentUserId) entry.myReactionId = r.id
  updateReactionsUI(r.message_id)
}

function handleReactionDelete(r) {
  const emojiMap = reactionsMap.get(r.message_id)
  if (!emojiMap) return
  const entry = emojiMap.get(r.emoji)
  if (!entry) return
  entry.count = Math.max(0, entry.count - 1)
  if (r.user_id === currentUserId) entry.myReactionId = null
  if (entry.count === 0) emojiMap.delete(r.emoji)
  if (emojiMap.size === 0) reactionsMap.delete(r.message_id)
  updateReactionsUI(r.message_id)
}

function subscribeToChannelReactions(channelId) {
  if (realtimeReactionsSub) { supabase.removeChannel(realtimeReactionsSub); realtimeReactionsSub = null }
  realtimeReactionsSub = supabase
    .channel(`reactions:${channelId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reactions', filter: `channel_id=eq.${channelId}` }, (payload) => handleReactionInsert(payload.new))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'reactions', filter: `channel_id=eq.${channelId}` }, (payload) => handleReactionDelete(payload.old))
    .subscribe()
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

let ytTokenClient = null
let ytAccessToken = null
let ytTokenExpiry = 0

function getYtTokenClient() {
  if (!ytTokenClient) {
    ytTokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/youtube',
      callback: () => {},
    })
  }
  return ytTokenClient
}

function requestYouTubeToken() {
  return new Promise((resolve, reject) => {
    if (ytAccessToken && Date.now() < ytTokenExpiry) {
      resolve(ytAccessToken)
      return
    }
    const client = getYtTokenClient()
    client.callback = (response) => {
      if (response.error) { reject(new Error(response.error)); return }
      ytAccessToken = response.access_token
      ytTokenExpiry = Date.now() + (response.expires_in - 60) * 1000
      resolve(ytAccessToken)
    }
    client.requestAccessToken()
  })
}

async function addToPlaylist(videoId, btnEl) {
  const profile = profilesById.get(currentUserId)
  const playlistId = profile?.youtube_playlist_id
  if (!playlistId) {
    alert("You haven't set a YouTube playlist yet. Click your name or avatar to open your profile and add one.")
    return
  }
  btnEl.disabled = true
  btnEl.textContent = '...'
  try {
    const token = await requestYouTubeToken()
    const res = await fetch('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } } }),
    })
    if (res.ok) {
      btnEl.textContent = '✓ Added'
      btnEl.style.background = 'rgba(20, 120, 20, 0.85)'
    } else {
      const err = await res.json()
      throw new Error(err.error?.message || 'Unknown error')
    }
  } catch (err) {
    btnEl.textContent = '＋ Add'
    btnEl.disabled = false
    alert(`Couldn't add to playlist: ${err.message}`)
  }
}

const URL_REGEX = /(https?:\/\/[^\s]+)/g

function getYouTubeId(urlStr) {
  let url
  try {
    url = new URL(urlStr)
  } catch {
    return null
  }

  if (url.hostname === 'youtu.be') return url.pathname.slice(1).split('/')[0] || null

  if (url.hostname.endsWith('youtube.com')) {
    if (url.pathname === '/watch') return url.searchParams.get('v')
    if (url.pathname.startsWith('/embed/')) return url.pathname.split('/')[2]
    if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2]
    if (url.pathname.startsWith('/live/')) return url.pathname.split('/')[2]
  }

  return null
}

function renderLinkifiedBody(bodyEl, text) {
  let lastIndex = 0
  let match
  const youtubeIds = []

  while ((match = URL_REGEX.exec(text))) {
    if (match.index > lastIndex) bodyEl.appendChild(document.createTextNode(text.slice(lastIndex, match.index)))

    const url = match[0]
    const linkEl = document.createElement('a')
    linkEl.href = url
    linkEl.textContent = url
    linkEl.target = '_blank'
    linkEl.rel = 'noopener noreferrer'
    linkEl.className = 'message-link'
    bodyEl.appendChild(linkEl)

    const youtubeId = getYouTubeId(url)
    if (youtubeId) youtubeIds.push(youtubeId)

    lastIndex = match.index + url.length
  }

  if (lastIndex < text.length) bodyEl.appendChild(document.createTextNode(text.slice(lastIndex)))

  return youtubeIds
}

function createYouTubePreview(videoId) {
  const wrapper = document.createElement('div')
  wrapper.className = 'youtube-preview'

  const thumbEl = document.createElement('img')
  thumbEl.className = 'youtube-thumbnail'
  thumbEl.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
  thumbEl.alt = 'YouTube video preview'

  const playBtnEl = document.createElement('div')
  playBtnEl.className = 'youtube-play-btn'
  playBtnEl.textContent = '▶'

  const openLinkEl = document.createElement('a')
  openLinkEl.className = 'youtube-open-link'
  openLinkEl.href = `https://www.youtube.com/watch?v=${videoId}`
  openLinkEl.target = '_blank'
  openLinkEl.rel = 'noopener noreferrer'
  openLinkEl.title = 'Open in YouTube'
  openLinkEl.textContent = 'Open in YouTube ↗'
  openLinkEl.addEventListener('click', (e) => e.stopPropagation())

  const toAppend = [thumbEl, playBtnEl, openLinkEl]

  if (GOOGLE_CLIENT_ID) {
    const saveBtnEl = document.createElement('button')
    saveBtnEl.type = 'button'
    saveBtnEl.className = 'youtube-save-btn'
    saveBtnEl.textContent = '＋ Add'
    saveBtnEl.title = 'Add to your YouTube playlist'
    saveBtnEl.addEventListener('click', (e) => {
      e.stopPropagation()
      addToPlaylist(videoId, saveBtnEl)
    })
    toAppend.push(saveBtnEl)
  }

  wrapper.append(...toAppend)
  wrapper.addEventListener(
    'click',
    () => {
      const iframeEl = document.createElement('iframe')
      iframeEl.className = 'youtube-iframe'
      iframeEl.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`
      iframeEl.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
      iframeEl.allowFullscreen = true
      wrapper.replaceChildren(iframeEl)
    },
    { once: true }
  )

  return wrapper
}

async function deleteMessage(messageId) {
  if (!confirm('Delete this message?')) return
  const { error } = await supabase.from('messages').delete().eq('id', messageId)
  if (error) alert(`Couldn't delete message: ${error.message}`)
}

function renderMessage(message, repliedToMessage = null, msgReactions = null) {
  const senderName = profilesById.get(message.user_id)?.display_name || 'Unknown'

  const isReplyToMe = repliedToMessage?.user_id === currentUserId && message.user_id !== currentUserId

  const messageEl = document.createElement('div')
  messageEl.className = isReplyToMe ? 'message message-reply-to-me' : 'message'
  messageEl.dataset.messageId = message.id

  const avatarEl = document.createElement('div')
  avatarEl.className = 'message-avatar message-avatar-clickable'
  avatarEl.style.background = getAvatarColor(message.user_id)
  avatarEl.textContent = getInitials(senderName)
  avatarEl.addEventListener('click', () => openProfileModal(message.user_id))

  const contentEl = document.createElement('div')
  contentEl.className = 'message-content'

  if (repliedToMessage) {
    const replyPreviewEl = document.createElement('div')
    replyPreviewEl.className = 'reply-preview'
    const replyName = profilesById.get(repliedToMessage.user_id)?.display_name || 'Unknown'
    const snippet = repliedToMessage.body.length > 80 ? repliedToMessage.body.slice(0, 80) + '…' : repliedToMessage.body
    const replyNameEl = document.createElement('span')
    replyNameEl.className = 'reply-preview-name'
    replyNameEl.textContent = replyName
    const replyBodyEl = document.createElement('span')
    replyBodyEl.className = 'reply-preview-body'
    replyBodyEl.textContent = snippet
    replyPreviewEl.append('↩ ', replyNameEl, ': ', replyBodyEl)
    replyPreviewEl.addEventListener('click', () => {
      const originalEl = messageListEl.querySelector(`[data-message-id="${repliedToMessage.id}"]`)
      if (originalEl) {
        originalEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
        originalEl.classList.add('message-highlight')
        originalEl.addEventListener('animationend', () => originalEl.classList.remove('message-highlight'), { once: true })
      }
    })
    contentEl.appendChild(replyPreviewEl)
  }

  const metaEl = document.createElement('div')
  metaEl.className = 'message-meta'

  const senderEl = document.createElement('span')
  senderEl.className = 'message-sender message-sender-clickable'
  senderEl.textContent = senderName
  senderEl.addEventListener('click', () => openProfileModal(message.user_id))

  const timeEl = document.createElement('span')
  timeEl.className = 'message-time'
  timeEl.textContent = formatTimestamp(message.created_at)

  const replyBtnEl = document.createElement('button')
  replyBtnEl.type = 'button'
  replyBtnEl.className = 'message-reply-btn'
  replyBtnEl.textContent = '↩'
  replyBtnEl.title = 'Reply'
  replyBtnEl.addEventListener('click', () => showReplyBar(message))

  metaEl.append(senderEl, timeEl, replyBtnEl)

  if (message.user_id === currentUserId) {
    const deleteBtnEl = document.createElement('button')
    deleteBtnEl.type = 'button'
    deleteBtnEl.className = 'message-delete-btn'
    deleteBtnEl.textContent = '🗑'
    deleteBtnEl.title = 'Delete message'
    deleteBtnEl.addEventListener('click', () => deleteMessage(message.id))
    metaEl.appendChild(deleteBtnEl)
  }

  const bodyEl = document.createElement('div')
  bodyEl.className = 'message-body'
  const youtubeIds = renderLinkifiedBody(bodyEl, message.body)

  const reactionsContainerEl = document.createElement('div')
  reactionsContainerEl.className = 'reactions-container'
  reactionsContainerEl.dataset.reactionsFor = message.id
  renderReactions(message.id, msgReactions, reactionsContainerEl)

  contentEl.append(metaEl, bodyEl)
  youtubeIds.forEach((id) => contentEl.appendChild(createYouTubePreview(id)))
  contentEl.appendChild(reactionsContainerEl)

  messageEl.append(avatarEl, contentEl)
  messageListEl.appendChild(messageEl)
}

function scrollMessagesToBottom() {
  messageListEl.scrollTop = messageListEl.scrollHeight
}

async function ensureProfileLoaded(userId) {
  if (profilesById.has(userId)) return
  const { data } = await supabase.from('profiles').select('id, display_name, created_at, youtube_playlist_id').eq('id', userId).single()
  if (data) {
    profilesById.set(data.id, data)
    renderMemberList()
  }
}

async function loadProfiles() {
  const { data, error } = await supabase.from('profiles').select('id, display_name, created_at, youtube_playlist_id')
  if (error) return
  profilesById = new Map(data.map((p) => [p.id, p]))
  renderMemberList()
}

function renderMemberList() {
  memberListEl.innerHTML = ''
  const members = Array.from(profilesById.values()).sort((a, b) => a.display_name.localeCompare(b.display_name))

  members.forEach((profile) => {
    const li = document.createElement('li')

    const avatarEl = document.createElement('div')
    avatarEl.className = 'member-avatar'
    avatarEl.style.background = getAvatarColor(profile.id)
    avatarEl.textContent = getInitials(profile.display_name)

    const nameEl = document.createElement('span')
    nameEl.textContent = profile.display_name

    li.append(avatarEl, nameEl)
    li.addEventListener('click', () => openProfileModal(profile.id))
    memberListEl.appendChild(li)
  })
}

async function loadMessages(channelId) {
  messageListEl.innerHTML = ''
  const firstUnreadAt = lastReadAt.get(channelId) ?? null

  const [messagesResult, reactionsResult] = await Promise.all([
    supabase.from('messages').select('id, body, created_at, user_id, reply_to_id').eq('channel_id', channelId).order('created_at', { ascending: true }),
    supabase.from('reactions').select('id, message_id, user_id, emoji').eq('channel_id', channelId),
  ])

  if (messagesResult.error) return

  reactionsMap = new Map()
  for (const r of reactionsResult.data || []) {
    if (!reactionsMap.has(r.message_id)) reactionsMap.set(r.message_id, new Map())
    const emojiMap = reactionsMap.get(r.message_id)
    if (!emojiMap.has(r.emoji)) emojiMap.set(r.emoji, { count: 0, myReactionId: null })
    const entry = emojiMap.get(r.emoji)
    entry.count++
    if (r.user_id === currentUserId) entry.myReactionId = r.id
  }

  const data = messagesResult.data
  const replyIds = [...new Set(data.filter((m) => m.reply_to_id).map((m) => m.reply_to_id))]
  const repliedById = new Map()
  if (replyIds.length > 0) {
    const { data: replyData } = await supabase.from('messages').select('id, body, user_id').in('id', replyIds)
    replyData?.forEach((m) => repliedById.set(m.id, m))
  }

  let dividerInserted = false
  data.forEach((msg) => {
    if (firstUnreadAt && !dividerInserted && msg.created_at > firstUnreadAt) {
      const dividerEl = document.createElement('div')
      dividerEl.className = 'unread-divider'
      const spanEl = document.createElement('span')
      spanEl.textContent = 'New messages'
      dividerEl.appendChild(spanEl)
      messageListEl.appendChild(dividerEl)
      dividerInserted = true
    }
    renderMessage(msg, repliedById.get(msg.reply_to_id) ?? null, reactionsMap.get(msg.id) ?? null)
  })

  const dividerEl = messageListEl.querySelector('.unread-divider')
  if (dividerEl) {
    dividerEl.scrollIntoView({ block: 'center' })
  } else {
    scrollMessagesToBottom()
  }

  markChannelRead(channelId)
}

let realtimeAllMessagesSub = null

function subscribeToAllChannelsForUnread() {
  if (realtimeAllMessagesSub) { supabase.removeChannel(realtimeAllMessagesSub); realtimeAllMessagesSub = null }
  realtimeAllMessagesSub = supabase
    .channel('all-messages-unread')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
      const { channel_id, user_id } = payload.new
      if (channel_id !== activeChannelId && user_id !== currentUserId) {
        unreadChannels.add(channel_id)
        renderChannelList()
      }
    })
    .subscribe()
}

function subscribeToChannelMessages(channelId) {
  if (realtimeMessagesSub) {
    supabase.removeChannel(realtimeMessagesSub)
    realtimeMessagesSub = null
  }

  realtimeMessagesSub = supabase
    .channel(`messages:${channelId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` },
      async (payload) => {
        await ensureProfileLoaded(payload.new.user_id)
        let repliedToMessage = null
        if (payload.new.reply_to_id) {
          const { data } = await supabase
            .from('messages')
            .select('id, body, user_id')
            .eq('id', payload.new.reply_to_id)
            .single()
          repliedToMessage = data
        }
        renderMessage(payload.new, repliedToMessage, null)
        scrollMessagesToBottom()
      }
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` },
      (payload) => {
        const messageEl = messageListEl.querySelector(`[data-message-id="${payload.old.id}"]`)
        messageEl?.remove()
      }
    )
    .subscribe()
}

function renderChannelList() {
  channelListEl.innerHTML = ''
  channels.forEach((channel) => {
    const li = document.createElement('li')
    li.dataset.channelId = channel.id
    if (channel.id === activeChannelId) li.classList.add('active')
    if (unreadChannels.has(channel.id)) li.classList.add('unread')

    const nameEl = document.createElement('span')
    nameEl.className = 'channel-name'
    nameEl.textContent = `#${channel.name}`
    nameEl.addEventListener('click', () => selectChannel(channel))

    const editBtn = document.createElement('button')
    editBtn.type = 'button'
    editBtn.className = 'channel-edit-btn'
    editBtn.textContent = '✏️'
    editBtn.title = 'Rename channel'
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      startEditingChannel(channel, li)
    })

    li.append(nameEl, editBtn)
    channelListEl.appendChild(li)
  })
}

function startEditingChannel(channel, li) {
  li.innerHTML = ''
  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'channel-edit-input'
  input.value = channel.name
  li.appendChild(input)
  input.focus()
  input.select()

  let settled = false
  const finish = async (save) => {
    if (settled) return
    settled = true
    if (save) {
      const newName = input.value.trim().toLowerCase().replace(/\s+/g, '-')
      if (newName && newName !== channel.name) {
        await renameChannel(channel, newName)
        return
      }
    }
    renderChannelList()
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true)
    if (e.key === 'Escape') finish(false)
  })
  input.addEventListener('blur', () => finish(true))
}

async function renameChannel(channel, newName) {
  const { data, error } = await supabase
    .from('channels')
    .update({ name: newName })
    .eq('id', channel.id)
    .select()
    .single()

  if (error) {
    alert(`Couldn't rename channel: ${error.message}`)
    renderChannelList()
    return
  }

  channel.name = data.name
  channels.sort((a, b) => a.name.localeCompare(b.name))
  if (channel.id === activeChannelId) {
    currentChannelNameEl.textContent = `#${channel.name}`
    messageInput.placeholder = `Message #${channel.name}`
  }
  renderChannelList()
}

async function selectChannel(channel) {
  activeChannelId = channel.id
  localStorage.setItem(`underthink:lastChannel:${currentUserId}`, channel.id)
  currentChannelNameEl.textContent = `#${channel.name}`
  messageInput.placeholder = `Message #${channel.name}`
  clearReply()
  renderChannelList()
  closeSidebar()
  await loadMessages(channel.id)
  subscribeToChannelMessages(channel.id)
  subscribeToChannelReactions(channel.id)
}

async function loadChannels() {
  const { data, error } = await supabase.from('channels').select('*').order('name', { ascending: true })
  if (error) return
  channels = data

  const savedChannelId = localStorage.getItem(`underthink:lastChannel:${currentUserId}`)
  const channelToSelect = channels.find((c) => c.id === savedChannelId) || channels[0]
  if (channelToSelect) {
    await selectChannel(channelToSelect)
  } else {
    renderChannelList()
  }
}

newChannelForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  const name = newChannelInput.value.trim().toLowerCase().replace(/\s+/g, '-')
  if (!name) return

  const { data, error } = await supabase.from('channels').insert({ name }).select().single()
  if (error) {
    console.error('Failed to create channel:', error)
    alert(`Couldn't create channel: ${error.message}`)
    return
  }

  newChannelInput.value = ''
  channels.push(data)
  channels.sort((a, b) => a.name.localeCompare(b.name))
  await selectChannel(data)
})

messageForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  const body = messageInput.value.trim()
  if (!body || !activeChannelId) return

  const { data: sessionData } = await supabase.auth.getSession()
  const userId = sessionData.session?.user.id
  if (!userId) return

  const replyId = replyToMessage?.id ?? null
  messageInput.value = ''
  clearReply()
  await supabase.from('messages').insert({
    channel_id: activeChannelId,
    user_id: userId,
    body,
    ...(replyId ? { reply_to_id: replyId } : {}),
  })
})

async function loadApp() {
  await loadProfiles()
  loadLastRead()
  await loadChannels()
  subscribeToAllChannelsForUnread()
  await checkUnreadChannels()
  showChatScreen()
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const dividerEl = messageListEl.querySelector('.unread-divider')
    if (dividerEl) {
      dividerEl.scrollIntoView({ block: 'center' })
    } else {
      scrollMessagesToBottom()
    }
  }))
}

function resetApp() {
  if (realtimeMessagesSub) { supabase.removeChannel(realtimeMessagesSub); realtimeMessagesSub = null }
  if (realtimeReactionsSub) { supabase.removeChannel(realtimeReactionsSub); realtimeReactionsSub = null }
  if (realtimeAllMessagesSub) { supabase.removeChannel(realtimeAllMessagesSub); realtimeAllMessagesSub = null }
  clearReply()
  reactionsMap = new Map()
  lastReadAt = new Map()
  unreadChannels = new Set()
  channels = []
  activeChannelId = null
  profilesById = new Map()
  channelListEl.innerHTML = ''
  messageListEl.innerHTML = ''
  memberListEl.innerHTML = ''
  authForm.reset()
  setAuthMode('login')
  closeSidebar()
  showAuthScreen()
}

const UNINITIALIZED = Symbol('uninitialized')
let loadedUserId = UNINITIALIZED

function handleSessionChange(session) {
  const userId = session?.user.id ?? null
  if (userId === loadedUserId) return
  loadedUserId = userId
  currentUserId = userId

  if (session) {
    loadApp()
  } else {
    resetApp()
  }
}

supabase.auth.onAuthStateChange((_event, session) => {
  handleSessionChange(session)
})

supabase.auth
  .getSession()
  .then(({ data }) => handleSessionChange(data.session))
  .catch(() => showAuthScreen())
