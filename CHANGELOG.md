## 0.0.3

### Feature

- Add HTTP server to serve generated file ea5783a 269cb9b
  - the generation is automatically performed when content is modified
- It is now possible to specify an access_token and a ref in the queryString
- The dynamic mode now uses an HTTP server, so custom routes are honored in this mode too

### Incompatible changes

- Replace Grunt by Gulp 269cb9b
- ⚠ baked.js can now be runned using `node generate.js <src> <dst>` or `gulp` 8c01c77
  - the old way (`node src/server.js <src> <dst>`) is not working anymore
- remove `.html` from generated files 63be33b


### Fix

- Fix query escape pattern (`$$` was not escaping) f7a03e9
- baked: Queries can now refer to bookmarks ed9fad9

