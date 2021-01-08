module.exports = {
	tasks: [
		`${__dirname}/tasks/pre-integration/set-stage-variables-backend.js`,
		`${__dirname}/tasks/pre-integration/set-ssm-backend.js`,
		`${__dirname}/tasks/pre-integration/set-url-info.js`,
		`${__dirname}/tasks/pre-integration/implement-cors.js`,
		`${__dirname}/tasks/pre-integration/set-custom-request-headers.js`,
		`${__dirname}/tasks/pre-integration/prepare-backend-call.js`,
		`${__dirname}/tasks/pre-integration/create-integration-event.js`
	]
};
