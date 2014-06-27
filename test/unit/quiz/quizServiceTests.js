var Q = require('q');
var chai = require('chai');
chai.use(require("chai-as-promised"));
chai.use(require('chai-things'));
var expect = chai.expect;
var mongoose = require('mongoose');
var async = require('async');
var _ = require('underscore');
var QuizService = require('../../../lib/quiz/quizService');
var User = require('../../../lib/user');
var Quiz = require('../../../lib/quiz').Quiz;
var Topic = require('../../../lib/quiz').Topic;
var FillInQuestion = require('../../../lib/questions/fillIn').FillInQuestion;
var MultipleChoiceQuestion = require('../../../lib/questions/multipleChoice').MultipleChoiceQuestion;

var MONGODB_URL = process.env.MONGODB_TEST_URL || 'localhost:27017/swot_test';
chai.Assertion.includeStack = true;

describe('quizService', function () {

    before(function (done) {
        this.timeout(5000);
        mongoose.connect(MONGODB_URL);

        // Delete all users and quizzes so we start off with a clean slate
        User.remove({}, function (err) {
            if (err) throw err;
            Quiz.remove({}, function (err) {
                if (err) throw err;
                User.remove({}, done);
            });
        });
    });

    after(function () {
        mongoose.connection.close();
    });

    describe('createQuestion', function () {

        it('should instantiate FillInQuestion', function () {
            var question = QuizService.createQuestion({
                type: 'FillInQuestion',
                questionHtml: "What is the name of the photoreceptors in the retina of the eye that allow for color as well as detail vision?",
                answer: "cones",
                alternativeAnswers: ["cone"]
            });
            expect(question).to.be.an.instanceof(FillInQuestion);
        });

        it('should instantiate MultipleChoiceQuestion', function () {
            var question = QuizService.createQuestion({
                type: 'MultipleChoiceQuestion',
                questionHtml: '<p>What is the capital of North Dakota?</p>',
                choices: ['Pierre', 'Bismarck', 'Des Moines', 'Helena'],
                correctAnswerIndex: 1
            });
            expect(question).to.be.an.instanceof(MultipleChoiceQuestion);
        });

        it('should throw error for invalid question types', function () {
            expect(function () {
                QuizService.createQuestion({
                    type: 'BadQuestionType',
                    foo: 'bar'
                });
            }).to.throw(Error, /Invalid question type/);
        });

    });

    describe('createQuiz', function () {

        var testUserId;

        before(function (done) {
            return User.createUser({
                email: 'createQuizTests@example.com',
                password: 'tester'
            }).done(function (user) {
                testUserId = user._id;
                done();
            });
        });

        it('should be able to create a quiz and associate it with a user', function (done) {
            Q(User.findById(testUserId).exec())
                .then(function (user) {
                    return QuizService.createQuiz({
                        name: 'My Test Quiz',
                        topic: user.topics[0]
                    }, user);
                })
                .then(function (result) {
                    var quiz = result[0];
                    var user = result[1];
                    expect(quiz).to.exist;
                    expect(user._id.toString()).to.equal(testUserId.toString());
                    var testQuizId = quiz._id;

                    // Ensure quiz is associated with the user
                    expect(quiz.createdBy.toString()).to.equal(testUserId.toString());  // Check quiz.createdBy
                    User.findOne({ _id: testUserId }, function (err, user) {           // Check User.quizzes (need to reload document first because it's out of sync)
                        if (err) throw err;
                        expect(user.quizzes).to.contain(testQuizId);
                    });
                })
                .done(function () { done(); });

        });

        it('should save questions when creating a quiz', function (done) {
            Q(User.findById(testUserId).exec())
                .then(function (user) {
                    return QuizService.createQuiz({
                        name: 'Night Flying',
                        topic: user.topics[0],
                        questions: [
                            new FillInQuestion({
                                questionHtml: "What is the name of the photoreceptors in the retina of the eye that allow for color as well as detail vision?",
                                answer: "cones",
                                alternativeAnswers: ["cone"]
                            }),
                            new FillInQuestion({
                                questionHtml: "During a constant rate turn, you tilt your head down " +
                                    "to change a fuel tank. The rapid head movement creates an overwhelming " +
                                    "sensation of rotating, turning, or accelerating in a " +
                                    "different direction. What is this illusion called?",
                                answer: "Coriolis Illusion",
                                ignoreCase: true,
                                alternativeAnswers: [
                                    'coriolis',
                                    'the coriolis illusion'
                                ]
                            })
                        ]
                    }, user);
                })
                .then(function (result) {
                    var quiz = result[0];
                    expect(quiz.questions).to.have.length(2);
                    expect(quiz.questions[0]).to.be.an.instanceof(FillInQuestion);
                    expect(quiz.questions[0].answer).to.equal('cones');
                    expect(quiz.questions[1]).to.be.an.instanceof(FillInQuestion);
                    expect(quiz.questions[1].answer).to.equal('Coriolis Illusion');
                })
                .done(function () { done(); });
        });

        it('should allow questions to be plain objects and automatically instantiate the appropriate type', function (done) {
            Q(User.findById(testUserId).exec())
                .then(function (user) {
                    return QuizService.createQuiz({
                        name: 'Night Flying',
                        topic: user.topics[0],
                        questions: [
                            {
                                type: 'FillInQuestion',
                                questionHtml: "What is the name of the photoreceptors in the retina of the eye that allow for color as well as detail vision?",
                                answer: "cones",
                                alternativeAnswers: ["cone"]
                            },
                            {
                                type: 'MultipleChoiceQuestion',
                                questionHtml: '<p>What is the capital of North Dakota?</p>',
                                choices: ['Pierre', 'Bismarck', 'Des Moines', 'Helena'],
                                correctAnswerIndex: 1
                            }
                        ]
                    }, user);
                })
                .then(function (result) {
                    var quiz = result[0];
                    expect(quiz.questions).to.have.length(2);
                    expect(quiz.questions[0]).to.be.an.instanceof(FillInQuestion);
                    expect(quiz.questions[0].answer).to.equal('cones');
                    expect(quiz.questions[1]).to.be.an.instanceof(MultipleChoiceQuestion);
                    expect(quiz.questions[1].correctAnswerIndex).to.equal(1);
                })
                .done(function () { done(); });
        });

        it('should verify topic exists when creating a quiz', function (done) {
            var testUser;
            Q(User.findById(testUserId).exec())
                .then(function (user) {
                    testUser = user;
                    return QuizService.createTopic({
                        name: "Parent"
                    }, testUser);
                })
                .then(function (result) {
                    var parentTopic = result[0];
                    return Topic.findByIdAndRemove(parentTopic._id).exec();
                })
                .then(function (deletedTopic) {
                    return expect(QuizService.createQuiz({
                        name: "Orphan",
                        topic: deletedTopic
                    }, testUser)).to.be.rejectedWith("Topic not found.");
                })
                .done(function () { done(); });
        });

        it('should verify topic is owned by user when creating a quiz', function (done) {
            var topic;
            Q(User.findById(testUserId).exec())
                .then(function (user) {
                    return QuizService.createTopic({
                        name: "Test Topic"
                    }, user);
                })
                .then(function (result) {
                    topic = result[0];
                    return User.createUser({
                        email: 'mallory2@example.com',
                        password: 'tester'
                    });
                })
                .then(function (mallory) {
                    return expect(QuizService.createQuiz({
                        name: "Mallory's Quiz",
                        topic: topic
                    }, mallory)).to.be.rejectedWith("Failed to create quiz: topic is not owned by user.");
                })
                .done(function () { done(); });
        });

        it('should ignore createdBy from the data param and instead use the user param', function (done) {
            var user;
            Q(User.findById(testUserId).exec())
                .then(function (_user) {
                    user = _user;
                    return User.createUser({
                        email: 'someoneelse2@example.com',
                        password: 'tester'
                    });
                })
                .then(function (someoneElse) {
                    return QuizService.createQuiz({
                        name: "Literature",
                        topic: user.topics[0],
                        createdBy: someoneElse
                    }, user);
                })
                .then(function (result) {
                    var quiz = result[0];
                    expect(quiz.createdBy.toString()).to.equal(testUserId.toString());
                })
                .done(function () { done(); });
        });

        it('should ignore dateCreated from the data param and instead use the current date', function (done) {
            Q(User.findById(testUserId).exec())
                .then(function (user) {
                    return QuizService.createQuiz({
                        name: "History",
                        topic: user.topics[0],
                        dateCreated: new Date(2005, 5, 24)
                    }, user);
                })
                .then(function (result) {
                    var quiz = result[0];
                    var today = new Date();
                    expect(quiz.dateCreated.getFullYear()).to.equal(today.getFullYear());
                })
                .done(function () { done(); });
        });
    });

    describe('createTopic', function () {

        var testUserId;

        before(function (done) {
            return User.createUser({
                email: 'createTopicTests@example.com',
                password: 'tester'
            }).done(function (user) {
                testUserId = user._id;
                done();
            });
        });

        it('should be able to create a topic and associate it with a user', function (done) {
            Q(User.findById(testUserId).exec())
                .then(function (user) {
                    return QuizService.createTopic({
                        name: "Philosophy"
                    }, user);
                })
                .then(function (result) {
                    var topic = result[0];
                    expect(topic).to.exist;
                    expect(topic.name).to.equal('Philosophy');
                    expect(topic.createdBy.toString()).to.equal(testUserId.toString());
                })
                .done(function () { done(); });
        });

        it("should add root topics to the user.topics array", function (done) {
            var topicId;
            Q(User.findById(testUserId).exec())
                .then(function (user) {
                    return QuizService.createTopic({
                        name: "Finance"
                    }, user);
                })
                .then(function (result) {
                    topicId = result[0]._id;
                    return User.findById(testUserId).exec();
                })
                .then(function (user) {
                    expect(user.topics).to.contain(topicId);

                    // Assert the topic has been added to user.topics only once
                    expect(_.filter(user.topics, function (id) {
                        return id.equals(topicId)
                    }).length).to.equal(1);
                })
                .done(function () { done(); });
        });

        it('should be able to create a subtopic by specifying the parent topic ID', function (done) {
            var parentTopicId;
            Q(User.findById(testUserId).exec())
                .then(function (user) {
                    return QuizService.createTopic({
                        name: "Philosophy"
                    }, user);
                })
                .then(function (result) {
                    var topic = result[0];
                    parentTopicId = topic._id;
                    return QuizService.createTopic({
                        name: "Logic and Reasoning",
                        parent: topic
                    }, result[1]);
                })
                .then(function (result) {
                    var subtopic = result[0];
                    expect(subtopic).to.exist;
                    expect(subtopic.name).to.equal('Logic and Reasoning');
                })
                .done(function () { done(); });
        });

        it("should add the subtopic to the parent topic's subtopics array", function (done) {
            var parentTopicId;
            var subtopicId;
            Q(User.findById(testUserId).exec())
                .then(function (user) {
                    return QuizService.createTopic({
                        name: "Philosophy"
                    }, user);
                })
                .then(function (result) {
                    var topic = result[0];
                    parentTopicId = topic._id;
                    return QuizService.createTopic({
                        name: "Epistemology",
                        parent: topic
                    }, result[1]);
                })
                .then(function (result) {
                    subtopicId = result[0]._id;
                    return Topic.findById(parentTopicId).exec();
                })
                .then(function (topic) {
                    expect(topic.subtopics).to.contain(subtopicId);

                    // Assert the topic has been added to the subtopics array only once
                    expect(_.filter(topic.subtopics, function (id) {
                        return id.equals(subtopicId)
                    }).length).to.equal(1);
                })
                .done(function () { done(); });
        });

        it('should verify parent topic exists when creating a subtopic', function (done) {
            var testUser;
            Q(User.findById(testUserId).exec())
                .then(function (user) {
                    testUser = user;
                    return QuizService.createTopic({
                        name: "Parent"
                    }, testUser);
                })
                .then(function (result) {
                    var parentTopic = result[0];
                    return Topic.findByIdAndRemove(parentTopic._id).exec();
                })
                .then(function (deletedTopic) {
                    return QuizService.createTopic({
                        name: "Orphan",
                        parent: deletedTopic
                    }, testUser);
                })
                .then(function (result) {
                    throw new Error("Oops - subtopic was created even though parent topic does " +
                        "not exist anymore. This should *not* have been allowed to happen!");
                })
                .catch(function (err) {
                    expect(err.message).to.equal("Parent topic not found.");
                })
                .done(function () { done(); });
        });

        it('should verify parent topic belongs to same user when creating a subtopic', function (done) {
            var topic;
            Q(User.findById(testUserId).exec())
                .then(function (user) {
                    return QuizService.createTopic({
                        name: "Test Topic"
                    }, user);
                })
                .then(function (result) {
                    topic = result[0];
                    return User.createUser({
                        email: 'mallory@example.com',
                        password: 'tester'
                    });
                })
                .then(function (mallory) {
                    return QuizService.createTopic({
                        name: "Mallory's Topic",
                        parent: topic
                    }, mallory);
                })
                .then(function (result) {
                    throw new Error("Oops - subtopic was created even though parent topic is " +
                        "not owned by the user. This should *not* have been allowed to happen!");
                })
                .catch(function (err) {
                    expect(err.message).to.equal("Failed to create subtopic: parent topic not owned by user.");
                })
                .done(function () { done(); });
        });

        it('should ignore createdBy from the data param and instead use the user param', function (done) {
            var user;
            Q(User.findById(testUserId).exec())
                .then(function (_user) {
                    user = _user;
                    return User.createUser({
                        email: 'someoneelse@example.com',
                        password: 'tester'
                    });
                })
                .then(function (someoneElse) {
                    return QuizService.createTopic({
                        name: "Literature",
                        createdBy: someoneElse
                    }, user);
                })
                .then(function (result) {
                    var topic = result[0];
                    expect(topic.createdBy.toString()).to.equal(testUserId.toString());
                })
                .done(function () { done(); });
        });

        it('should ignore dateCreated from the data param and instead use the current date', function (done) {
            Q(User.findById(testUserId).exec())
                .then(function (user) {
                    return QuizService.createTopic({
                        name: "History",
                        dateCreated: new Date(2005, 5, 24)
                    }, user);
                })
                .then(function (result) {
                    var topic = result[0];
                    var today = new Date();
                    expect(topic.dateCreated.getFullYear()).to.equal(today.getFullYear());
                })
                .done(function () { done(); });
        });

    });

    describe("getQuizzesAndTopics", function () {

        var testUser;
        var topics = {};
        var quizzes = {};
        var hierarchy;

        before(function (done) {
            return User.createUser({
                    email: 'hernando@example.com',
                    password: 'letmein'
                })
                .then(function (user) {
                    testUser = user;

                    return QuizService.importTopicTree(user, [
                        { name: 'Underwater Basket Weaving', quizzes: [], subtopics: [] },
                        {
                            name: 'Flying',
                            quizzes: [
                                {
                                    name: 'Night Flying',
                                    questions: [
                                        new FillInQuestion({
                                            questionHtml: "What is the name of the photoreceptors in the retina of the eye that allow for color as well as detail vision?",
                                            answer: "cones",
                                            alternativeAnswers: ["cone"]
                                        }),
                                        new FillInQuestion({
                                            questionHtml: "During a constant rate turn, you tilt your head down " +
                                                "to change a fuel tank. The rapid head movement creates an overwhelming " +
                                                "sensation of rotating, turning, or accelerating in a " +
                                                "different direction. What is this illusion called?",
                                            answer: "Coriolis Illusion",
                                            ignoreCase: true,
                                            alternativeAnswers: [
                                                'coriolis',
                                                'the coriolis illusion'
                                            ]
                                        })
                                    ]
                                },
                                { name: 'Weather', questions: [] }
                            ],
                            subtopics: [
                                { name: 'Regulations', quizzes: [] }
                            ]
                        },
                        {
                            name: 'Programming',
                            quizzes: [
                                { name: 'Algorithms & Data Structures', questions: [] },
                                { name: 'Security', questions: [] }
                            ],
                            subtopics: [
                                {
                                    name: 'Web Development',
                                    quizzes: [
                                        { name: 'HTML', questions: [] },
                                        { name: 'CSS', questions: [] },
                                        { name: 'JavaScript', questions: [] }
                                    ]
                                },
                                {
                                    name: 'C#.NET',
                                    quizzes: []
                                }
                            ]
                        }
                    ], null);
                })
                .then(function () {
                    // Update user doc
                    return User.findById(testUser._id).exec();
                })
                .then(function (user) {
                    testUser = user;
                    return QuizService.getQuizzesAndTopics(testUser);
                })
                .then(function (result) {
                    hierarchy = result;
                })
                .done(function () { done(); });
        });

        it('should load top-level topics correctly', function () {
            var topLevelTopics = _.pluck(hierarchy, 'name');
            // Note: "General" topic is created automatically when creating a new user
            expect(topLevelTopics).to.eql([ 'General', 'Underwater Basket Weaving', 'Flying', 'Programming' ]);
        });

        it('should set subtopics and quizzes to empty arrays if there are no subtopics or quizzes for a topic', function () {
            var underwaterBasketWeaving = _.findWhere(hierarchy, { name: 'Underwater Basket Weaving' });
            expect(underwaterBasketWeaving.subtopics).to.be.empty;
            expect(underwaterBasketWeaving.quizzes).to.be.empty;
        });

        it('should load quizzes for top-level topics correctly', function () {
            var flyingTopic = _.findWhere(hierarchy, { name: 'Flying' });
            var flyingQuizzes = _.pluck(flyingTopic.quizzes, 'name');
            expect(flyingQuizzes).to.eql([ 'Night Flying', 'Weather' ]);

            var programmingTopic = _.findWhere(hierarchy, { name: 'Programming' });
            var programmingQuizzes = _.pluck(programmingTopic.quizzes, 'name');
            expect(programmingQuizzes).to.eql([ 'Algorithms & Data Structures', 'Security' ]);
        });

        it('should load subtopics correctly', function () {
            var flyingTopic = _.findWhere(hierarchy, { name: 'Flying' });
            var flyingSubtopics = _.pluck(flyingTopic.subtopics, 'name');
            expect(flyingSubtopics).to.eql([ 'Regulations' ]);

            var programmingTopic = _.findWhere(hierarchy, { name: 'Programming' });
            var programmingSubtopics = _.pluck(programmingTopic.subtopics, 'name');
            expect(programmingSubtopics).to.eql([ 'Web Development', 'C#.NET' ]);
        });

        it('should load quizzes for subtopics correctly', function () {
            var programmingTopic = _.findWhere(hierarchy, { name: 'Programming' });
            var webdevSubtopic = _.findWhere(programmingTopic.subtopics, { name: 'Web Development' });
            var webdevQuizzes = _.pluck(webdevSubtopic.quizzes, 'name');
            expect(webdevQuizzes).to.eql([ 'HTML', 'CSS', 'JavaScript' ]);
        });

        it('should set quizzes to empty array for subtopics that have no quizzes', function () {
            var programmingTopic = _.findWhere(hierarchy, { name: 'Programming' });
            var csharpSubtopic = _.findWhere(programmingTopic.subtopics, { name: 'C#.NET' });
            expect(csharpSubtopic.quizzes).to.be.empty;
        });

        it('should set quiz.numQuestions to the number of questions in the quiz instead of returning the full questions list', function () {
            var flyingTopic = _.findWhere(hierarchy, { name: 'Flying' });
            var nightFlyingQuiz = _.findWhere(flyingTopic.quizzes, { name: 'Night Flying' });
            expect(nightFlyingQuiz.numQuestions).to.equal(2);
            expect(nightFlyingQuiz.questions).to.be.undefined;
        });
    });

    describe('deleteTopic', function () {
        var testUser;
        var topics = {};
        var quizzes = {};
        var hierarchy;

        before(function (done) {
            User.createUser({
                    email: 'ferdinand@example.com',
                    password: 'letmein'
                })
                .then(function (user) {
                    testUser = user;

                    return QuizService.importTopicTree(user, [
                        {
                            name: 'Science',
                            quizzes: [
                                { name: 'The Scientific Method', questions: [] },
                                { name: 'The Ethics of Scientific Research', questions: [] }
                            ],
                            subtopics: [
                                {
                                    name: 'Physics',
                                    quizzes: [
                                        { name: 'Physics 101', questions: [] }
                                    ],
                                    subtopics: [
                                        { name: "Classical Mechanics" },
                                        {
                                            name: 'Quantum Mechanics',
                                            quizzes: [
                                                { name: 'Introduction to Quantum Mechanics', questions: [] }
                                            ]
                                        }
                                    ]
                                },
                                {
                                    name: 'Chemistry',
                                    subtopics: [
                                        {
                                            name: 'Organic Chemistry',
                                            quizzes: [
                                                { name: 'Introduction to Organic Chemistry', questions: [] }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        },
                        {
                            name: 'Philosophy',
                            quizzes: [
                                { name: 'Introduction to Philosophy', questions: [] }
                            ],
                            subtopics: [
                                {
                                    name: 'Logic and Reasoning',
                                    quizzes: []
                                },
                                {
                                    name: 'Metaphysics',
                                    quizzes: [
                                        { name: 'Cosmology and Cosmogony', questions: [] },
                                        { name: 'Determinism and Free Will', questions: [] }
                                    ]
                                }
                            ]
                        },
                        { name: 'Underwater Basket Weaving', quizzes: [], subtopics: [] }
                    ], null);
                })
                .then(function () {
                    // Update user doc
                    return User.findById(testUser._id).exec();
                })
                .then(function (user) {
                    testUser = user;
                    return QuizService.getQuizzesAndTopics(testUser);
                })
                .then(function (result) {
                    hierarchy = result;
                    return;
                })
                .done(function () { done(); });
        });

        it('should successfully delete leaf topics and their quizzes', function (done) {
            // Delete the "Organic Chemistry" subtopic
            var organicChemistrySubtopic = QuizService.searchHierarchyByName(hierarchy, 'Organic Chemistry')[0];

            // Make sure quiz within the topic initially exists
            var introToOrganicChemistry = _.findWhere(organicChemistrySubtopic.quizzes, { name: 'Introduction to Organic Chemistry' });
            return Q(Quiz.findById(introToOrganicChemistry._id).exec())
                .then(function (quiz) {
                    expect(quiz).to.exist;
                    return Topic.findById(organicChemistrySubtopic._id).exec();
                })
                .then(function (topic) {
                    // Delete the topic
                    return QuizService.deleteTopic(topic)
                })
                .then(function () {
                    // Update user doc
                    return User.findById(testUser._id).exec();
                })
                .then(function (user) {
                    testUser = user;

                    // Retrieve new quiz/topic hierarchy
                    return QuizService.getQuizzesAndTopics(testUser);
                })
                .then(function (hierarchy) {
                    var result = QuizService.searchHierarchyByName(hierarchy, 'Organic Chemistry');

                    // Make sure topic got deleted
                    expect(result).to.be.empty;

                    // Also make sure quiz got deleted
                    return Quiz.findById(introToOrganicChemistry._id).exec()
                })
                .then(function (quiz) {
                    expect(quiz).not.to.exist;
                })
                .done(function () { done(); });
        });

        it('should successfully delete root topics, and all their subtopics and quizzes', function (done) {
            // Delete the "Philosophy" root topic and make sure all subtopics got deleted.

            var philosophyTopic = _.findWhere(hierarchy, { name: 'Philosophy' });
            var introToPhilosophyQuiz = _.findWhere(philosophyTopic.quizzes, { name: 'Introduction to Philosophy' });
            var logicSubtopic = _.findWhere(philosophyTopic.subtopics, { name: 'Logic and Reasoning' });
            var metaphysicsSubtopic = _.findWhere(philosophyTopic.subtopics, { name: 'Metaphysics' });
            var cosmologyQuiz = _.findWhere(metaphysicsSubtopic.quizzes, { name: 'Cosmology and Cosmogony' });
            var determinismQuiz = _.findWhere(metaphysicsSubtopic.quizzes, { name: 'Determinism and Free Will' });

            // Define utility functions for checking if a topic/quiz exists in the DB
            var topicExists = function (topic) { return Topic.findById(topic._id).exec().then(function (doc) { return !!doc; }); };
            var quizExists = function (quiz) { return Quiz.findById(quiz._id).exec().then(function (doc) { return !!doc; }); };

            // Make sure all of the above topics/quizzes initially exist.
            var topics = [philosophyTopic, logicSubtopic, metaphysicsSubtopic];
            var quizzes = [introToPhilosophyQuiz, cosmologyQuiz, determinismQuiz];
            return Q.all(_.map(topics, topicExists).concat(_.map(quizzes, quizExists)))
                .then(function (result) {
                    expect(result).to.eql([ true, true, true, true, true, true ]);

                    // Find and delete the root topic
                    return Topic.findById(philosophyTopic._id).exec().then(function (topic) {
                        return QuizService.deleteTopic(topic)
                    });
                })
                .then(function (result) {
                    // Make sure result is the deleted document
                    expect(result.name).to.equal('Philosophy');

                    // Make sure all of the prior topics/quizzes no longer exist in the DB
                    return Q.all(_.map(topics, topicExists).concat(_.map(quizzes, quizExists)))
                })
                .then(function (result) {
                    expect(result).to.eql([ false, false, false, false, false, false ]);

                    // Update user doc
                    return User.findById(testUser._id).exec();
                })
                .then(function (user) {
                    testUser = user;

                    // Retrieve the new quiz/topic hierarchy and make sure the philosophy topic is
                    // no longer present in the top-level topics list.
                    return QuizService.getQuizzesAndTopics(testUser);
                })
                .then(function (hierarchy) {
                    var philosophyTopic = _.findWhere(hierarchy, { name: 'Philosophy' });
                    expect(philosophyTopic).to.be.undefined;
                })
                .done(function () { done(); });
        });

        it("should remove root topics from the user.topics array when deleting a root topic", function (done) {
            // Delete the "Underwater Basket Weaving" topic

            var basketWeaving = _.findWhere(hierarchy, { name: 'Underwater Basket Weaving' });

            return Q(User.findById(testUser._id).exec())
                .then(function (user) {
                    // Make sure it exists initially
                    expect(user.topics).to.contain(basketWeaving._id)

                    // Delete the topic
                    return Topic.findById(basketWeaving._id).exec().then(function (topic) {
                        return QuizService.deleteTopic(topic);
                    });
                })
                .then(function () {
                    // Get the updated user doc
                    return User.findById(testUser._id).exec();
                })
                .then(function (user) {
                    // Make sure the topic is no longer present in the user's topics array
                    expect(user.topics).not.to.contain(basketWeaving._id)
                })
                .done(function () { done(); });
        });

        it("should remove subtopics from the parent topic's subtopics array", function (done) {
            // Delete the Classical Mechanics subtopic from the Physics topic

            var physics = QuizService.searchHierarchyByName(hierarchy, 'Physics')[0];
            var classicalMechanics = QuizService.searchHierarchyByName(hierarchy, 'Classical Mechanics')[0];
            expect([ physics, classicalMechanics ]).all.to.exist;

            return Q(Topic.findById(classicalMechanics._id).exec())
                .then(function (topic) {
                    return QuizService.deleteTopic(topic)
                })
                .then(function () {
                    // Retrieve the updated parent topic
                    return Topic.findById(physics._id).exec()
                })
                .then(function (topic) {
                    expect(topic.subtopics).not.to.contain(classicalMechanics._id);
                })
                .done(function () { done(); });
        });
    });

    describe('importTopicTree', function () {
        var testUser;
        var topics = {};
        var quizzes = {};
        var hierarchy;

        before(function (done) {

            return User.createUser({
                    email: 'pendergast@example.com',
                    password: 'letmein'
                })
                .then(function (user) {
                    testUser = user;

                    return QuizService.importTopicTree(user, [
                        {
                            name: 'Science',
                            quizzes: [
                                { name: 'The Scientific Method', questions: [] },
                                { name: 'The Ethics of Scientific Research', questions: [] }
                            ],
                            subtopics: [
                                {
                                    name: 'Physics',
                                    quizzes: [
                                        { name: 'Physics 101', questions: [] }
                                    ],
                                    subtopics: [
                                        {
                                            name: 'Quantum Mechanics',
                                            quizzes: [
                                                { name: 'Introduction to Quantum Mechanics', questions: [] }
                                            ]
                                        }
                                    ]
                                },
                                {
                                    name: 'Chemistry',
                                    subtopics: [
                                        {
                                            name: 'Organic Chemistry',
                                            quizzes: [
                                                { name: 'Introduction to Organic Chemistry', questions: [] }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        },
                        {
                            name: 'Philosophy',
                            quizzes: [
                                { name: 'Introduction to Philosophy', questions: [] }
                            ],
                            subtopics: [
                                { name: 'Logic and Reasoning', quizzes: [] },
                                { name: 'Metaphysics', quizzes: [] }
                            ]
                        },
                        { name: 'Underwater Basket Weaving', quizzes: [], subtopics: [] }
                    ], null);
                })
                .then(function () {
                    // Update user doc
                    return User.findById(testUser._id).exec();
                })
                .then(function (user) {
                    testUser = user;
                    return QuizService.getQuizzesAndTopics(testUser);
                })
                .then(function (result) {
                    hierarchy = result;
                    return;
                })
                .done(function () { done(); });
        });

        it('should import top-level topics', function () {
            var topLevelTopics = _.pluck(hierarchy, 'name');
            // Note: "General" topic is created automatically when creating a new user
            expect(topLevelTopics).to.eql([ 'General', 'Science', 'Philosophy', 'Underwater Basket Weaving' ]);
        });

        it('should import quizzes for top-level topics', function () {
            var scienceTopic = _.findWhere(hierarchy, { name: 'Science' });
            var scienceQuizzes = _.pluck(scienceTopic.quizzes, 'name');
            expect(scienceQuizzes).to.eql([ 'The Scientific Method', 'The Ethics of Scientific Research' ]);

            var philosophyTopic = _.findWhere(hierarchy, { name: 'Philosophy' });
            var philosophyQuizzes = _.pluck(philosophyTopic.quizzes, 'name');
            expect(philosophyQuizzes).to.eql([ 'Introduction to Philosophy' ]);
        });

        it('should import empty topics correctly', function () {
            var underwaterBasketWeaving = _.findWhere(hierarchy, { name: 'Underwater Basket Weaving' });
            expect(underwaterBasketWeaving.subtopics).to.be.empty;
            expect(underwaterBasketWeaving.quizzes).to.be.empty;
        });

        it('should import subtopics correctly', function () {
            var scienceTopic = _.findWhere(hierarchy, { name: 'Science' });
            var scienceSubtopics = _.pluck(scienceTopic.subtopics, 'name');
            expect(scienceSubtopics).to.eql([ 'Physics', 'Chemistry' ]);

            var philosophyTopic = _.findWhere(hierarchy, { name: 'Philosophy' });
            var philosophySubtopics = _.pluck(philosophyTopic.subtopics, 'name');
            expect(philosophySubtopics).to.eql([ 'Logic and Reasoning', 'Metaphysics' ]);
        });

        it('should import quizzes for subtopics', function () {
            var scienceTopic = _.findWhere(hierarchy, { name: 'Science' });
            var physicsSubtopic = _.findWhere(scienceTopic.subtopics, { name: 'Physics' });
            var physicsQuizzes = _.pluck(physicsSubtopic.quizzes, 'name');
            expect(physicsQuizzes).to.eql([ 'Physics 101' ]);
        });

        it('should import subtopics without quizzes correctly', function () {
            var scienceTopic = _.findWhere(hierarchy, { name: 'Science' });
            var chemistrySubtopic = _.findWhere(scienceTopic.subtopics, { name: 'Chemistry' });
            var chemistryQuizzes = _.pluck(chemistrySubtopic.quizzes, 'name');
            expect(chemistryQuizzes).to.be.empty;
        });

        it('should import sub-subtopics correctly', function () {
            var scienceTopic = _.findWhere(hierarchy, { name: 'Science' });
            var chemistrySubtopic = _.findWhere(scienceTopic.subtopics, { name: 'Chemistry' });
            var chemistrySubtopics = _.pluck(chemistrySubtopic.subtopics, 'name');
            expect(chemistrySubtopics).to.eql([ 'Organic Chemistry' ]);
        });

        it('should import sub-subtopics quizzes correctly', function () {
            var scienceTopic = _.findWhere(hierarchy, { name: 'Science' });
            var chemistrySubtopic = _.findWhere(scienceTopic.subtopics, { name: 'Chemistry' });
            var organicChemistrySubtopic = _.findWhere(chemistrySubtopic.subtopics, { name: 'Organic Chemistry' });
            var organicChemistryQuizzes = _.pluck(organicChemistrySubtopic.quizzes, 'name');
            expect(organicChemistryQuizzes).to.eql([ 'Introduction to Organic Chemistry' ]);
        });
    });

    describe('searchHierarchyByName', function (done) {

        var testUser;
        var topics = {};
        var quizzes = {};
        var hierarchy;

        before(function (done) {

            return User.createUser({
                email: 'searchHierarchyByName@example.com',
                password: 'letmein'
            })
                .then(function (user) {
                    testUser = user;

                    return QuizService.importTopicTree(user, [
                        {
                            name: 'Science',
                            quizzes: [
                                { name: 'The Scientific Method', questions: [] },
                                { name: 'The Ethics of Scientific Research', questions: [] }
                            ],
                            subtopics: [
                                {
                                    name: 'Physics',
                                    quizzes: [
                                        { name: 'Physics 101', questions: [] }
                                    ],
                                    subtopics: [
                                        {
                                            name: 'Quantum Mechanics',
                                            quizzes: [
                                                { name: 'Introduction to Quantum Mechanics', questions: [] }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        },
                        { name: 'Same Name', quizzes: [], subtopics: [] },
                        { name: 'Same Name', quizzes: [], subtopics: [] }
                    ], null);
                })
                .then(function () {
                    // Update user doc
                    return User.findById(testUser._id).exec();
                })
                .then(function (user) {
                    testUser = user;
                    return QuizService.getQuizzesAndTopics(testUser);
                })
                .then(function (result) {
                    hierarchy = result;
                    return;
                })
                .done(function () { done(); });
        });

        it('should be able to find root topics', function () {
            var result = QuizService.searchHierarchyByName(hierarchy, 'Science');
            expect(result).to
                .have.length(1)
                .and.have.deep.property('[0].name', 'Science');
        });

        it('should be able to find subtopics', function () {
            var result = QuizService.searchHierarchyByName(hierarchy, 'Quantum Mechanics');
            expect(result).to
                .have.length(1)
                .and.have.deep.property('[0].name', 'Quantum Mechanics');
        });

        it('should return full topic objects, complete with _id and parent pointers', function () {
            var result = QuizService.searchHierarchyByName(hierarchy, 'Quantum Mechanics');
            expect(result).to.have.length(1);
            expect(result).to.have.deep.property('[0].name');
            expect(result).to.have.deep.property('[0]._id');
            expect(result).to.have.deep.property('[0].parent');
        });

        it('should return an empty array if there are no matches', function () {
            var result = QuizService.searchHierarchyByName(hierarchy, 'Managerial Science');
            expect(result).to.be.empty;
        });

        it('should return multiple matches', function () {
            var result = QuizService.searchHierarchyByName(hierarchy, 'Same Name');
            expect(result).to
                .have.length(2)
                .and.all.have.property('name', 'Same Name');
        });
    });
});
