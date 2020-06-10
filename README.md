# Cupcake Template

This is Cupcake🧁, a mirror of my [personal website](https://carolchen.me/). It contains all the features of that website except the blog! Cupcake is best served as a portfolio or online resume. This project will be actively maintained to be a better codebase, and implement new features. It is also open to any kind of contribution - features, bug fixes, improvements or documentation. Some features of the website: 

 - Randomization on-visit for colour theme 🌈 (with setup to dynamically generate css files) 
 - Randomization of quotes and images
 - CSS striped background
 - Trapezoidal top bar with typing-info 
 - Dynamic portfolio/resume section with content read from JSON file. 
    - Includes a slider to filter content, and animations to show content enter/exits
Scroll down to see incoming features! 

I'd love to see anything people do with this template so drop an email at `hello@carolchen.me` any time. I'm also available for technical support.  

# Getting started 

Run the following to set up the project and install dependencies. (You can also use the "Use this template" button at the top instead of cloning)
```bash 
git clone https://github.com/kipply/cupcake-template.git && cd cupcake-template
npm install -g node-sass-chokidar 
npm install -g react-run-all 
npm install -g react-scripts 
npm install
``` 

Then to start serving the website;
```
npm start
``` 
This will auto-refresh and build CSS on all changes!

To find all the points in the website where data should be replaced with something specific to you, search the project for 🧁. Sometimes the 🧁 is accompanied by `{{}}` and some kind of description. 


# Deployment
The general deployment process usually involves running `npm run build` and 
placing that into a static site generator. To see all the options, check out [Create React App's Guide](https://create-react-app.dev/docs/deployment/#firebase). I listed some options with pros and cons below, I personally use Firebase. 

### Firebase Hosting
Pros: Deploy logs, UI for rollback, not tied to github commits

Cons: May cost some money (it's like 20 cents a month for me for like 1000 visits including some image-heavy pages)


### Github Pages
Pros: Free forever

Cons: Tied to your github commits/pushes


# Customizations

### Adding Routes
The template ships by default with `/` pointing to `index.html` and that is also be configured and reflected in Firebase. If additional pages are desired there are a few options. 

1. *For all deployment paths.* Using [React Routes](https://reacttraining.com/react-router/web/guides/quick-start), which should be intuitive and easy and work well with the project structure. 

2. *For Firebase Deploy.* Using additional files in `public/`. This is better for any raw HTML files or PDFs. If you added `Resume.pdf` to `public/`, then `yourwebsite.com/Resume.pdf` will work. If you want `/resume` to be a valid path, add the following to the `firebase.json` under `"rewrites"`. 
```json
{
    "source": "/resume",
    "destination": "/Resume.pdf"
},
``` 

3. *For other static hosting.* Adding additional files in `public/` will generally work. 


### Analytics
An analytics service such as Google Analytics will give you a script that should be added to `public/index.html` in the `footer` element. 

### Favicon
The favicon is the little icon that'll appear in the browser tab. It is defaulted to a sparkly heart, though can be changed by replacing `public/favicon.ico`. 


# Upcoming features

1. Remove dependency on Bootstrap. This was a sad mistake made by fourteen year-old Carol that has lasted many years

2. Proper 404 pages

3. Add linting rules that work well for this project

4. Built-in blogs. I'm neutral about existing tools (I currently use hexo to statically generate), but I want to build a little static-generator (from markdown) that'll let me route with React and let me hard-code urls. I also want interactive and better-looking code blocks!  tl;dr I have little to demand from a static-blog generator and I'd prefer to build it myself since Hexo is already annoying me with the which-version-of-node-am-i-compatible-with game. 

5. Use a different object notation format for the portfolio data that's less vertically-intensive. Probably YAMLs, which I actually don't hate. 
