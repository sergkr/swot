var editQuiz = angular.module('EditQuiz', ['ui.bootstrap', 'ui.sortable']);

// 'focus-on' directive for setting focus to an element
editQuiz.directive('focusOn', function() {
    return function(scope, elem, attr) {
        scope.$on('focusOn', function(e, name) {
            if(name === attr.focusOn) {
                elem[0].focus();
            }
        });
    };
});

editQuiz.factory('focus', function ($rootScope, $timeout) {
    return function(name) {
        $timeout(function (){
            $rootScope.$broadcast('focusOn', name);
        });
    }
});


// EditQuiz Controller
// -------------------

editQuiz.controller('EditQuizCtrl', function ($scope, $http, $timeout, focus) {
    $scope._id = _quizId || null;
    $scope.name = "";
    $scope.questions = [{}];
    $scope.alerts = [];
    $scope.saveStatus = "";
    $scope.saveMessage = "";
    $scope.savedSuccessfully = true;
    $scope.addQuestionTooltip = "You can also add a question by hitting the TAB key after typing in the last answer.";
    $scope.addQuestionTooltipsRemaining = 2;    // Stop showing the tooltip after adding a couple questions.
    
    $scope.isNew = function () {
        return $scope._id === null;
    }

    $scope.serialize = function () {
        return {
            _id: $scope._id,
            name: $scope.name,
            questions: $scope.questions
        };
    };

    $scope.deserialize = function (data) {
        $scope.name = data.name;
        $scope.questions = data.questions;
    }

    $scope.load = function () {
        var handleError = function (error) {
            alert('An error occurred while loading the quiz: \n' + error);
        };

        if (!$scope._id) { handleError("Quiz ID is missing."); }

        $http.get('/load', {
            params: { id: $scope._id }
        }).success(function (response) {
            if (response.success) {
                $scope.deserialize(response.quiz);
            } else {
                console.log(response);
                alert('An error occurred while loading the quiz: \n' + response.message);
            }
        }).error(function (response) {
            console.log(response);
            alert('An error occurred while loading the quiz: \n' + response);
        });
    }

    $scope.save = function () {
        var handleError = function (error) {
            $scope.saveStatus = "";
            $scope.saveMessage = 'An error occurred while saving the quiz: ' + error;
            $scope.savedSuccessfully = false;
        };

        $scope.closeAllAlerts();

        $http.post($scope.isNew() ? '/create' : '/save', $scope.serialize())
            .success(function (response) {
                if (response.success) {
                    if ($scope.isNew()) { $scope._id = response.id; }
                    $scope.saveStatus = "Saved";
                    $scope.savedSuccessfully = true;
                    $timeout(function () {
                        $scope.saveStatus = "";
                    }, 2000);
                } else {
                    handleError(response.message);
                }
            })
            .error(function (response) {
                handleError(response);
            });
    };

    $scope.deleteQuiz = function () {
        var handleError = function (error) {
            $scope.showError("An error occurred while deleting the quiz: " + error);
        };

        $scope.closeAllAlerts();

        $http.post('/delete', { _id: $scope._id })
            .success(function (response) {
                if (response.success) {
                    bootbox.alert("The quiz has been deleted successfully.", function () {
                        window.location.href = "/quizzes";
                    });
                } else {
                    handleError(response.message);
                }
            })
            .error(function (response) {
                handleError(response);
            });
    };

    $scope.addQuestion = function () {
        $scope.questions.push({});

        // Focus on the first input field for the newly-added question
        focus('newQuestionAdded');

        // Stop showing the tooltip on the Add Question button after adding a couple questions
        if (--$scope.addQuestionTooltipsRemaining <= 0) {
            $scope.addQuestionTooltip = "";
        }
    };

    $scope.removeQuestion = function (index) {
        $scope.questions.splice(index, 1);
    }

    $scope.sortableOptions = {
        update: function(e, ui) { },
        placeholder: 'sortable-list-placeholder',
        forcePlaceholderSize: true,
        start: function (e, ui) {
            ui.placeholder.height(ui.item.outerHeight());
        }
    };


    // Alerts
    // ------

    $scope.showError = function (message) {
        return $scope.alerts.push({ type: 'danger', msg: message }) - 1;
    };

    $scope.showSuccess = function (message) {
        return $scope.alerts.push({ type: 'success', msg: message }) - 1;
    };

    $scope.showInfo = function (message) {
        return $scope.alerts.push({ type: 'info', msg: message }) - 1;
    };

    $scope.showWarning = function (message) {
        return $scope.alerts.push({ type: 'warning', msg: message }) - 1;
    };

    $scope.closeAlert = function(index) {
        $scope.alerts.splice(index, 1);
    };

    $scope.closeAllAlerts = function() {
        $scope.alerts = [];
    };


    // Events
    // ------

    $scope.answerKeypress = function ($index, $event) {
        // Add new question when hitting TAB on the last input
        if ($index === $scope.questions.length - 1) {
            if ($event.keyCode === 9 &&  !$event.ctrlKey && !$event.metaKey && !$event.altKey && !$event.shiftKey) {
                $scope.addQuestion();
            }
        }
    }


    // Initialization
    // --------------

    if ($scope._id) { $scope.load(); }
});
