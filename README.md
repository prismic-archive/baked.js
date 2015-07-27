baked.js
========

[![NPM version](https://badge.fury.io/js/baked.svg)](http://badge.fury.io/js/baked)
[![Build Status](https://api.travis-ci.org/prismicio/baked.js.png)](https://travis-ci.org/prismicio/baked.js)

baked.js is a static website generator, using Node.js, which embed an updated version of the precedent JS script.

## Install

```sh
npm install -g baked
```

## Use

### Simple generation

Run the command:

```sh
baked
```

It will generate all files from the current directory into the `generated/` directory.

You can set some options using command line arguments:

- `--no-async`: Generate files one by one (slower but easier to debug)
- `--src <src_dir>`: Specify the source directory
- `--dst <dst_dir>`: Specify the directory where generated files will be stored
- `--ignore <pattern>`: Ignore a file/directory (can be use multiple times)

### Custom generation

You can specify your own gulpfile.js and use the tasks you defined.

Have a look on the examples to see how you can achieve this.

## Local server

Run the command:

```sh
gulp serve
```

This task:

- generates the content (as “`gulp`” does)
- starts an HTTP server which serves the generated files
- watches modification on your sources (and the baked.js sources) and re-generate on every changes

Go to [http://127.0.0.1:8282](http://127.0.0.1:8282) using your favorite browser and you will see the result.

## Try on the examples

Some examples of sources directory is available in the `examples/` directory.

- the `blank` example presents a blank project based on baked.js
- the `stylus` example presents a project based on baked.js and using Stylus
  - to test it, install its dependencies (`npm install`) then run `gulp`
- the `vanilla` example presents a project containing only sources
  - to test it, install baked (`npm install -g baked`) then run `baked`

## Template

Lodash's template can be used, with syntax “`[% %]`” (and “`[%= %]`”, “`[%- %]`”).

Here are the variables passed to the template:

- `_`: Lodash
- `api`: The main API object
- `bookmarks`: The bookmarks list
- `ref`: The current ref
- `refs`: The refs list
- `types`: The types list
- `tags`: The tags list
- `master`: The master ref

```html
[% _.each(tags, function (tag) { %]
  <span>[%= tag %]</span>
[% }) %]
```

## Queries

Queries (to prismic.io repositories) can be written directly in the template, using specify `<script>` tags (with `type="text/prismic-query"`).

The documents returned by the queries are passed to the templated through the variable whose name is specified with `data-binding` attribute.

Pagination related parameters can be specified using `data-query-<name>` syntax, however their names must be written in dash-case instead of camelCase (for instance the parameter `pageSize` should be specified using `data-query-page-size`).

```html
<script type="text/prismic-query" data-binding="featuredProducts" data-query-orderings="[my.product.name]">
  [
    [:d = any(document.type, ["product"])]
    [:d = at(document.tags, ["Featured"])]
  ]
</script>

<h1>[%= featuredProducts.total_results_size %] featured products:</h1>
[% _.each(featuredProducts.results, function(product) { %]
  <div>
    <h2>[%= product.getText('product.name') %]</h2>
    <img data-src="[%= product.getImageView('product.image', 'icon').url %]">
  </div>
[% }) %]
```

## Links

To create links to an other generated page, use the helper `pathTo`, and specify the file name (without the “.html” part).

```html
<a href="[%= pathTo('search') %]">[%= product.getText('product.name') %]</a>
```

## Page parameters

Some pages (like articles of a blog) can have dynamically generated URL. This can be done by creating one file and specify parameter, like the ID of the article.

The problem is that these parameters are generally not known before parsing other pages linking to them. For instance the main blog page lists some articles (displaying previews) and gives links to the full article pages. That's how we know that there are articles of these specific IDs.

In baked.js, we use linking pages to infer that there are articles to be generated with these specific IDs. In short, we need to know that a page is needed in order to be able to create it!

First, add a `<meta>` tag per parameter in the page's header.

```html
<meta name="prismic-routing-param" content="id">
```

Then use these parameters in your query, by using the syntax `$name` or `${name}.`

```html
<script type="text/prismic-query" data-binding="product">
  [
    [:d = any(document.id, ["$id"])]
  ]
</script>
```

To create links to the above page, use the helper `pathTo`, and specify the arguments.

```html
<a href="[%= pathTo('product', {id: product.id}) %]">
    [%= product.getText('product.name') %]
</a>
```

**Bonus**: if your only argument is “`id`”, you can give it directly, without wraping it in a “`{id: "xxx"}`” structure.

```html
<a href="[%= pathTo('product', product.id) %]">
    [%= product.getText('product.name') %]
</a>
```

You can also use the helper without providing any argument.

```html
<a href="[%= pathTo('index') %]">index</a>
```

**Note**: remember: if nobody calls a page (using the `pathTo` helper) it won't be generated.

### Custom URL

It is possible to customize the URL as well. To do so, just add a `<meta>` tag “`prismic-routing-pattern`” in your page's header.

```html
<meta name="prismic-routing-pattern" content="product/$id">
```

**Warning**: be sure to specify every routing params in the URL! If you don't, we can't guarantee that there won't be URL conflict.

## Internals

baked.js is built on top of [Node.js](nodejs.org).

It uses [Q](https://github.com/kriskowal/q) and [lodash](http://lodash.com),
let [Gulp](gulpjs.com) and [browserify](browserify.org) handle the generation
of the browser library and uses [EJS](https://github.com/visionmedia/ejs) for
the template rendering.

### Dynamic browser mode

The generation can actually be performed at 2 places:

- Statically by the gulp task
  - This is the standard mode.
  - It allows to send proper content the browsers and search engines.
- Dynamically by the browser
  - Every statically rendered page is able to re-generate itself, and then to emulate the navigation in the others pages (using [HTML5's History API](http://www.whatwg.org/specs/web-apps/current-work/multipage/history.html#the-history-interface)).
  - It allows to specify specific `access_token` and `ref`, in order to render the content using a specific prismic.io's release. These can be set automatically using the [OAuth2 authentication](#auth2-authentication).

The dynamic mode needs some specific components:

- The baked.js library (for instance `<script src="https://prismicio.github.io/baked.js/baked-0.3.0.min.js"></script>`)
- The template of every content file (stored in the `.html.tmpl` files)
  - These files allow to render any page
- The routing informations of every content pages (stored in `_router.json`
  - This file allows to build a router which is used to
    - create a link between the current page and the ones references by the `pathTo` helper (reverse routing)
    - find the template to use, its parameters and the given argument in case of non-statically-rendered page (routing)
      - This case can happen when loading a page that is created only with a specific release.

#### Specific ref to use

baked.js provides a helper to easilly switch between refs.

It listen changes made on elements containing the attribute
“`data-prismic-action="update"`” and update the ref (and re-generate)
accordingly.

Here an example of use:

```ejs
<select data-prismic-action="update">
  [% _.each(refs, function (r) { %]
    [% if (r.ref == ref) { %]
      <option value="[%= r.ref %]" selected="selected">[%= r.label %]</option>
    [% } else { %]
      <option value="[%= r.ref %]">[%= r.label %]</option>
    [% } %]
  [% }) %]
</select>
```

#### OAuth2 authentication

baked.js provides a helper to authenticate to your prismic.io application
using OAuth2.

It listen the “click” events on elements containing attributes
“`data-prismic-action="signout"`” or “`data-prismic-action="signin"`.”

In order to work, this feature needs a meta tag “`prismic-oauth-client-id`”
to be defined.

Here an example:

```ejs
<meta name="prismic-oauth-client-id" content="YOUR_CLIENT_ID">
...
[% if (loggedIn) { %]
  <select data-prismic-action="update">
    [% _.each(refs, function (r) { %]
      [% if (r.ref == ref) { %]
        <option value="[%= r.ref %]" selected="selected">[%= r.label %]</option>
      [% } else { %]
        <option value="[%= r.ref %]">[%= r.label %]</option>
      [% } %]
    [% }) %]
  </select>
  <button data-prismic-action="signout">Sign out</button>
[% } else { %]
  <button data-prismic-action="signin">Sign in</button>
[% } %]
```

### Contributions

- Étienne Vallette d'Osia (@dohzya)
- Guillaume Bort (@guillaumebort)
- Sébastien Renault (@srenault)
- Robin van Breukelen (@robinvanb)
- Mike Moulton (@mmoulton)
- Jonathan Bennett (@jbennett)
- @rdpacheco
- Erwan Loisant (@erwan)
- Paul Egan (paulegan)
- Russell Dempsey (@SgtPooki)

### Licence

This software is licensed under the Apache 2 license, quoted below.

Copyright 2013 Zengularity (http://www.zengularity.com).

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this project except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0.

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
