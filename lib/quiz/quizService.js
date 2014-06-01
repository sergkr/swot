var _ = require('underscore');
var Q = require('q');
var mongoose = require('mongoose-q')();
var util = require('../util');
var Quiz = require('../quiz').Quiz;
var Topic = require('../quiz').Topic;
var User = require('../user');

exports.getSubtopics = function (topic) {
    return Topic.find({ parent: topic._id }).exec();
};

exports.getQuizzesByTopic = function (topic) {
    return Quiz.find({ topic: topic._id }).exec();
};

/**
 * Loads all the quizzes and topics.
 * @param user THe user whose quizzes and topics to load
 * @returns {Promise} Promise for an array of topics, with each topic having a subtopics property
 *      (for child topics) and a quizzes property (quizzes that are directly associated with that
 *      topic).
 */
exports.getQuizzesAndTopics = function (user) {
  // Load root-level topics
    return Q.all(_.map(user.topics, function (topicId) {
        return Topic.findById(topicId).exec();
    })).then(function (topics) {
        // Emit warnings for topics that were not found in the topics collection (implying
        // user.topics is out of sync).
        _.each(topics, function (topic, i) {
            if (!topic) {
                console.warn('Topic ' + user.topics[i] + ' exists in user.topics for user ' + user.email +
                    ' (' + user._id + '), but could not be found in topics collection.');
                return null;
            }
            return topic;
        });

        // Filter out null topics
        topics = _.without(topics, null);

        // Transform root topics into simple objects, and strip off unneeded properties
        var result = _.map(topics, function (topic) {
            return _.omit(topic.toObject(), [ 'createdBy', '__v' ]);
        });

        // Recursively load quizzes and subtopics.
        return Q.all(_.map(topics, function (topic, i) {
            return exports.getQuizzesAndSubtopics(topic, result[i]);
        })).then(function () {
            return result;
        });
    });
};

/**
 * Returns the quizzes and child topics associated with the given topic. The quizzes and subtopics
 * are returned by modifying the 'result' parameter.
 * @param topic The topic whose quizzes and subtopics to load.
 * @param result The object where to tack on the quizzes and subtopics. This object will be modified
 *      by adding a "quizzes" property and a "subtopics" property.
 * @returns {Promise} This function returns the passed in result object with the quizzes and
 *      subtopics tacked onto it.
 */
exports.getQuizzesAndSubtopics = function (topic, result) {
    return Q.all([exports.getQuizzesByTopic(topic), exports.getSubtopics(topic)])
        .spread(function (quizzes, subtopics) {
            result.quizzes = _.map(quizzes, function (quiz) {
                quiz = quiz.toObject();
                quiz.numQuestions = quiz.questions.length;
                return _.omit(quiz, [ 'questions', 'createdBy', '__v' ]);
            });
            result.subtopics = _.map(subtopics, function (subtopic) {
                return _.omit(subtopic.toObject(), [ 'createdBy', '__v' ]);
            });
            return Q.all(_.map(subtopics, function (subtopic, i) {
                return exports.getQuizzesAndSubtopics(subtopic, result.subtopics[i]);
            })).then(function () {
                return result;
            });
        });
};

/**
 * Deletes the specified topic, along with its quizzes and all subtopics (and also including all
 * quizzes within all subtopics).
 * @param topic The topic to delete
 * @returns {Promise} Returns a promise for the deleted topic document.
 */
exports.deleteTopic = function (topic) {
    return exports.getQuizzesAndSubtopics(topic, topic.toObject())
        .then(function (result) {
            return Q.all(_.map(result.quizzes, exports.deleteQuiz)
                .concat(_.map(result.subtopics, function (subtopic) {
                    return Topic.findById(subtopic._id).exec().then(function (subtopic) {
                        return exports.deleteTopic(subtopic);
                    });
                })));
        })
        .then(function () {
            return Topic.findByIdAndRemove(topic._id).exec();
        })
        .then(function (deletedTopic) {
            // If this was a top-level topic, then we need to remove it from the user.topics
            // array as well
            if (!deletedTopic.parent) {
                return User.findById(deletedTopic.createdBy).exec()
                    .then(function (user) {
                        return User.findByIdAndUpdate(user._id, { $pull: { topics: deletedTopic._id }}).exec();
                    })
                    .then(function () {
                        return deletedTopic;
                    });
            }

            // Otherwise, just return the deleted topic
            return deletedTopic;
        });
};

exports.deleteQuiz = function (quiz) {
    return Quiz.findByIdAndRemove(quiz._id).exec()
        .then(function (quiz) {
            return User.findById(quiz.createdBy).exec();
        })
        .then(function (user) {
            return user.quizzes.remove(quiz._id);
        });
};

/**
 * Adds the topic tree, including all associated subtopics and quizzes, to the user's own list of
 * topics.
 * @param user The user who should own the imported topics and quizzes
 * @param topics An array of topic objects, which each topic having 'name', 'quizzes', and 'subtopics'
 *      properties.
 * @param root The root topic underneath which the imported topics should be added, or null if the
 *      topics should be imported as top-level topics.
 * @return {Promise}
 */
exports.importTopicTree = function (user, topics, root) {

    // TODO: Consider having this function return something useful, like the updated user doc

    // TODO: Expose importTopic as a module export
    var importTopic = function importTopic (topic, parent) {
        topic.parent = parent;
        var createdTopic;
        return Topic.createTopic(topic, user)
            .then(function (result) {
                createdTopic = result[0];
                user = result[1];

                var importRemainingQuizzes = function (remaining) {
                    var quiz = remaining.shift();
                    if (quiz) {
                        quiz.topic = createdTopic;
                        return Quiz.createQuiz(quiz, user).then(function (result) {
                            user = result[1];
                            return importRemainingQuizzes(remaining);
                        });
                    }
                };

                return Q(importRemainingQuizzes(topic.quizzes || []));
            })
            .then(function () {
                return Q.all(_.map(topic.subtopics, function (subtopic) {
                    return importTopic(subtopic, createdTopic);
                }));
            });
    };

    // Argh! Root topics must be imported serially because they all modify the user document
    // (by pushing to the user.topics array), so we can't use Q.all here.
    //
    // TODO: It should be possible to clean this up a bit by either combining importTopic and
    // importRemainingTopics into one function, or maybe have importTopicTree itself be recursive
    // and have it import one topic at a time.
    var importRemainingTopics = function (remaining) {
        var topic = remaining.shift();
        if (topic) {
            return importTopic(topic, root).then(function () {
                return importRemainingTopics(remaining);
            });
        }
    };

    return importRemainingTopics(topics);
};