//META{"name":"SpotifyStatus", "pname":"SpotifyStatus"}*//

/* global PluginSettings:false, PluginUtilities:false, ReactUtilities:false, DOMUtilities:false, ColorUtilities:false */

class SpotifyStatus {
  getName() { return "SpotifyStatus"; }
  getShortName() { return "SpotifyStatus"; }
  getDescription() { return "Adds server-based role colors to typing, voice, popouts, modals and more! Support Server: bit.ly/ZeresServer"; }
  getVersion() { return "0.6.0"; }
  getAuthor() { return "Zerebos"; }

  constructor() {
    this.path = require("path");
    var { Client } = require('discord-rpc');
    this.keys = require(this.path.resolve(process.env.APPDATA, "BetterDiscord/Plugins/keys.json"));
    this.spotifyWeb = require(this.path.resolve(process.env.APPDATA, "BetterDiscord/Plugins/spotify.js"));
    this.log = require("fancy-log");
    this.events = require('events');
    this.fs = require('fs');
    this.songEmitter = new this.events.EventEmitter();
    
    this.rpc = new Client({ transport: this.keys.rpcTransportType });
    this.s = new this.spotifyWeb.SpotifyWebHelper();
    this.appClient = this.keys.appClientID;
    this.currentSong = {};
  }
  
  loadSettings() {
    this.settings = PluginUtilities.loadSettings(this.getShortName(), this.defaultSettings);
  }

  saveSettings() {
    PluginUtilities.saveSettings(this.getShortName(), this.settings);
  }
  
  load() {}
  unload() {}
  
  start() {
    var largeImageKey = this.keys.imageKeys.large;
    var smallImageKey = this.keys.imageKeys.small;
    var smallImagePausedKey = this.keys.imageKeys.smallPaused;
    
    
    /**
     * Initialise song listeners
     * newSong: gets emitted when the song changes to update the RP
     * songUpdate: currently gets executed when the song gets paused/resumes playing.
     **/
    this.songEmitter.on('newSong', song => {
      this.rpc.setActivity({
        details: `🎵  ${song.name}`,
        state: `👤  ${song.artist}`,
        startTimestamp: song.start,
        endTimestamp: song.end,
        largeImageKey,
        smallImageKey,
        largeImageText: `⛓  ${song.uri}`,
        smallImageText: `💿  ${song.album}`,
        instance: false,
      });
    
      this.log(`Updated song to: ${song.artist} - ${song.name}`);
    });
    
    this.songEmitter.on('songUpdate', song => {
      let startTimestamp = song.playing ?
        parseInt(new Date().getTime().toString().substr(0, 10)) - song.position :
        undefined,
        endTimestamp = song.playing ?
        startTimestamp + song.length :
        undefined;
    
      this.rpc.setActivity({
        details: `🎵  ${song.name}`,
        state: `👤  ${song.artist}`,
        startTimestamp,
        endTimestamp,
        largeImageKey,
        smallImageKey: startTimestamp ? smallImageKey : smallImagePausedKey,
        largeImageText: `⛓  ${song.uri}`,
        smallImageText: `💿  ${song.album}`,
        instance: false,
      });
    
      this.log(`Song state updated (playing: ${song.playing})`)
    });
    
    this.rpc.on('ready', () => {
        global.intloop = setInterval(this.checkSpotify, 1500, this);
    });
    
    this.rpc.login(this.appClient).catch(this.log.error);
  }
  async spotifyReconnect (self) {
    self.s.getStatus(function(err, res) {
      if (!err) {
        clearInterval(check);
        global.intloop = setInterval(self.checkSpotify, 1500, this);
      }
    });
  }
  
  async checkSpotify(self) {
    self.s.getStatus(function (err, res) {
      if (err) {
        if (err.code === "ECONNREFUSED") {
          if (err.address === "127.0.0.1" && err.port === 4381) {
              /**
               * Temporary workaround - to truly fix this, we need to change spotify.js to check for ports above 4381 to the maximum range.
               * This is usually caused by closing Spotify and reopening before the port stops listening. Waiting about 10 seconds should be
               * sufficient time to reopen the application.
               **/
              self.log.error("Spotify seems to be closed or unreachable on port 4381! Close Spotify and wait 10 seconds before restarting for this to work. Checking every 5 seconds to check if you've done so.");
              clearInterval(intloop);
              global.check = setInterval(self.spotifyReconnect, 5000, self);
          }
        } else {
            self.log.error("Failed to fetch Spotify data:", err);
        }
        return;
      }
  
      if (!res.track.track_resource || !res.track.artist_resource) return;
  
      if (self.currentSong.uri && res.track.track_resource.uri == self.currentSong.uri && (res.playing != self.currentSong.playing)) {
        self.currentSong.playing = res.playing;
        self.currentSong.position = res.playing_position;
        self.songEmitter.emit('songUpdate', self.currentSong);
        return;
      }
  
      if (res.track.track_resource.uri == self.currentSong.uri) return;
  
      let start = parseInt(new Date().getTime().toString().substr(0, 10)),
          end = start + (res.track.length - res.playing_position);
      
      var song = {
        uri: (res.track.track_resource.uri ? res.track.track_resource.uri : ""),
        name: res.track.track_resource.name,
        album: (res.track.album_resource ? res.track.album_resource.name : ""),
        artist: (res.track.artist_resource ? res.track.artist_resource.name : ""),
        playing: res.playing,
        position: res.playing_position,
        length: res.track.length,
        start,
        end
      };
      
      self.currentSong = song;
  
      self.songEmitter.emit('newSong', song);
    });
  }
  checkHosts(file) {
    if (file.includes("open.spotify.com")) throw new Error("Arr' yer be pirating, please remove \"open.spotify.com\" rule from your hosts file.");
  }
}