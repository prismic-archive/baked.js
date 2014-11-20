### Incompatible changes

- The queries results are no longer arrays but prismic.io's javascript-kit's `Response` object.
  + The response elements are in its `results` field

## 0.0.8

### Changes

- Stop generating a local version of the library
  + In order to use the dynamic generation, you should either
    * refer to an official library (for instance `https://prismicio.github.io/baked.js/baked-0.0.7.js`)
    * build yourself you own version of the library and put it yourself in the generated directory
  + This change allows to simplify the use, and reduce the building time ()

## 0.0.7

### Big change

baked is now a npm module containing an executable!

This means:

- you don't have to work inside the baked.js repository anymore
- you can use baked.js without creating any gulpfile.js and package.json file

**WARNING**

Because of this change, if you worked inside the baked.js directory in order to build your website, I strongly recommand to adapt you code accordingly:

1. cleanup `package.json` and add `baked` in dependencies (look at `example/blank/package.json`)
  - since this point, you can install and use the `baked` module
2. updates your `gulpfile.js` file to load `"baked/gulp"` instead of `"./src/tasks/gulp"`
  - since this point, you are not using the local baked.js files
3. you can now delete the `src` directory since you don't need it anymore
4. If you didn't do it already, you can also delete the `example` directory and the `README.md` and `CHANGELOG.md` files.

### Features

- Only errors are now displayed by default.
  + (ok this is not an error but it's still cool)
- Add `pathToHere` helper (returns the path of the current page)
- Add `urlTo` and `urlToHere` helpers (return the full URL)
  + do not confuse the new `urlTo` helper
    and the old (badly named) helper `url_to` which returns only a path.
- Add a global configuration file, which handles:
  - the logger level
  - the API's URL
  - the base URL

### Changes

- The `url_to` helper has been renamed into `pathTo`
  + the old version is still supported by deprecated
- Replace `src_dir` and `dst_dir` by `srcDir` and `dstDir`, but it should not break existing gulpfiles
  + the `init()` helper still supports `src_dir` and `dst_dir`
  + the `parseOptions()` helper's response and the `baked.config.options` object have `src_dir` and `dst_dir` as r/w properties.

## 0.0.6

###  Features

- Templates can now include Javascript files using `require`
  - Theses files are evaluated inside the template context
  - They are cached (but it's possible to bypass the cache)
- Added `clean` task
- Fixed a bug which may block generation

## 0.0.5

### Features

- Add template partial
  - A partial is a template whose name starts by “_”. It won't be rendered directly (so it doesn't need meta like “prismic-api”) but is included in other
templates using the helper `partial`. (`[%- partial('footer') %]` will include
the partial “_footer.html.erb”)
- Add helper to change ref
- Add OAuth2 authentication
- Use [EJS](https://github.com/visionmedia/ejs) for template rendering
  - Its HTML escaping and filters are available

### Incompatible changes

- Because EJS is now used, every template returning HTML have to be fixed
(by replacing `[%= ... %]` by `[%- ... %]`) in order to stop escaping the HTML
twice.

## 0.0.4

### Features

- The dynamic mode is now based on the HTTP server
  - custom routes are honored in this mode too
  - `url_to` now accepts global paths (“`/index`” for instance)
- It is now possible to specify an `access_token` and a `ref` in the queryString

### Incompatible changes

- Split tasks “`gulp`” and “`gulp serve`”
- ⚠ Remove the generate.js file
  - Run `gulp --src <src> --dst <dst>` instead

## Fixes

- Non-template HTML files are now copied correctly
- Supports query parameter names using camelcase

## 0.0.3

### Features

- Add HTTP server to serve generated file
  - the generation is automatically performed when content is modified

### Incompatible changes

- Replace Grunt by Gulp
- ⚠ baked.js can now be runned using `node generate.js <src> <dst>` or `gulp`
  - the old way (`node src/server.js <src> <dst>`) is not working anymore
- remove `.html` from generated files

### Fixes

- Fix query escape pattern (`$$` was not escaping)
- baked: Queries can now refer to bookmarks
