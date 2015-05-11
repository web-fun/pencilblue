/*
    Copyright (C) 2015  PencilBlue, LLC

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

//dependencies
var async = require('async');

module.exports = function(pb) {

    //pb dependencies
    var util = pb.util;

    /**
     * Interface for creating and editing articles
     */
    function ArticleForm(){}
    util.inherits(ArticleForm, pb.BaseController);

    ArticleForm.prototype.init = function (props, cb) {
        this.pathSiteUId = pb.SiteService.getCurrentSite(props.path_vars.siteid);
        this.queryService = new pb.SiteQueryService(this.pathSiteUId);

        pb.BaseController.prototype.init.call(this, props, cb);
    };

    ArticleForm.prototype.render = function(cb) {
        var self  = this;
        var vars = this.pathVars;
        this.vars = vars;

        self.gatherData(vars, function(err, results){
            if(util.isError(err)) {
                throw err;
            }
            else if(!results.article) {
                self.reqHandler.serve404();
                return;
            }

            self.article = results.article;
            if(!self.article.author) {
              self.article.author = self.session.authentication.user[pb.DAO.getIdField()].toString();
            }

            if(self.session.authentication.user.admin >= pb.SecurityService.ACCESS_EDITOR) {
              pb.users.getWriterOrEditorSelectList(self.article.author, true, function(err, availableAuthors) {
                if(availableAuthors && availableAuthors.length > 1) {
                  results.availableAuthors = availableAuthors;
                }
                self.finishRender(results, cb);
              });
              return;
            }

            self.finishRender(results, cb);
        });
    };

    ArticleForm.prototype.finishRender = function(results, cb) {
      var self = this;

      var tabs = self.getTabs();

      self.setPageName(self.article[pb.DAO.getIdField()] ? self.article.headline : self.ls.get('NEW_ARTICLE'));
      self.ts.registerLocal('angular_script', '');
      self.getAngularObjects(tabs, results, function(angularObjects) {
          self.ts.registerLocal('angular_objects', new pb.TemplateValue(angularObjects, false));
          self.ts.load('admin/content/articles/article_form', function(err, data) {
              self.onTemplateRetrieved('' + data, function(err, data) {
                  var result = '' + data;
                  self.checkForFormRefill(result, function(newResult) {
                      result = newResult;
                      cb({content: result});
                  });
              });
          });
      });
    };

    ArticleForm.prototype.onTemplateRetrieved = function(template, cb) {
        cb(null, template);
    };

    ArticleForm.prototype.getAngularObjects = function(tabs, data, cb) {
        var self = this;
        if(pb.config.multisite && !data.article.site) {
            data.article.site = pb.SiteService.getCurrentSite(this.pathVars.siteid);
        }
        if(data.article[pb.DAO.getIdField()]) {
            var media = [];
            var i, j;

            for(i = 0; i < data.article.article_media.length; i++) {
                for(j = 0; j < data.media.length; j++) {
                    if(pb.DAO.areIdsEqual(data.media[j][pb.DAO.getIdField()], data.article.article_media[i])) {
                        media.push(data.media[j]);
                        data.media.splice(j, 1);
                        break;
                    }
                }
            }
            data.article.article_media = media;

            var sections = [];
            for(i = 0; i < data.article.article_sections.length; i++) {
                for(j = 0; j < data.sections.length; j++) {
                    if(pb.DAO.areIdsEqual(data.sections[j][pb.DAO.getIdField()], data.article.article_sections[i])) {
                        sections.push(data.sections[j]);
                        data.sections.splice(j, 1);
                        break;
                    }
                }
            }
            data.article.article_sections = sections;

            var topics = [];
            for(i = 0; i < data.article.article_topics.length; i++) {
                for(j = 0; j < data.topics.length; j++) {
                    if(pb.DAO.areIdsEqual(data.topics[j][pb.DAO.getIdField()], data.article.article_topics[i])) {
                        topics.push(data.topics[j]);
                        data.topics.splice(j, 1);
                        break;
                    }
                }
            }
            data.article.article_topics = topics;
        }
        data.site = data.article.site;
        pb.AdminSubnavService.getWithSite(this.getActivePill(), this.ls, this.getActivePill(), data, function(pills) {
            var objects = {
                navigation: pb.AdminNavigation.get(self.session, ['content', 'articles'], self.ls),
                pills: pills,
                tabs: tabs,
                templates: data.templates,
                sections: data.sections,
                topics: data.topics,
                media: data.media,
                article: data.article
            };
            if(data.availableAuthors) {
                objects.availableAuthors = data.availableAuthors;
            }
            cb(pb.ClientJs.getAngularObjects(objects));
        });
    };

    ArticleForm.getSubNavItems = function(key, ls, data) {
        var adminPrefix = '/admin';
        if(data.article.site) {
            adminPrefix += pb.SiteService.getCurrentSitePrefix(data.article.site);
        }
        return [{
            name: 'manage_articles',
            title: data.article[pb.DAO.getIdField()] ? ls.get('EDIT') + ' ' + data.article.headline : ls.get('NEW_ARTICLE'),
            icon: 'chevron-left',
            href: adminPrefix + '/content/articles'
        }, {
            name: 'new_article',
            title: '',
            icon: 'plus',
            href: adminPrefix + '/content/articles/new'
        }];
    };

    ArticleForm.prototype.getActivePill = function() {
        return 'new_article';
    };

    ArticleForm.prototype.gatherData = function(vars, cb) {
        var self  = this;
        var dao   = new pb.DAO();
        var tasks = {
            templates: function(callback) {
                callback(null, pb.TemplateService.getAvailableContentTemplates());
            },

            sections: function(callback) {
                var opts = {
                    select: pb.DAO.PROJECT_ALL,
                    where: {
                        type: {$in: ['container', 'section']}
                    },
                    order: {name: pb.DAO.ASC}
                };
                self.queryService.q('section', opts, callback);
            },

            topics: function(callback) {
                var opts = {
                    select: pb.DAO.PROJECT_ALL,
                    where: pb.DAO.ANYWHERE,
                    order: {name: pb.DAO.ASC}
                };
                self.queryService.q('topic', opts, callback);
            },

            media: function(callback) {
                var mservice = new pb.MediaService();
                mservice.getBySite(vars.siteid, callback);
            },

            article: function(callback) {
                if(!pb.validation.isIdStr(vars.id, true)) {
                    callback(null, {});
                    return;
                }

                //TODO call article service
                dao.loadById(vars.id, 'article', callback);
            }
        };
        async.parallelLimit(tasks, 2, cb);
    };

    ArticleForm.prototype.getTabs = function() {
        return [
            {
                active: 'active',
                href: '#content',
                icon: 'quote-left',
                title: this.ls.get('CONTENT')
            },
            {
                href: '#media',
                icon: 'camera',
                title: this.ls.get('MEDIA')
            },
            {
                href: '#sections_dnd',
                icon: 'th-large',
                title: this.ls.get('SECTIONS')
            },
            {
                href: '#topics_dnd',
                icon: 'tags',
                title: this.ls.get('TOPICS')
            },
            {
                href: '#seo',
                icon: 'tasks',
                title: this.ls.get('SEO')
            }
        ];
    };

    //register admin sub-nav
    pb.AdminSubnavService.registerFor('new_article', ArticleForm.getSubNavItems);

    //exports
    return ArticleForm;
};
