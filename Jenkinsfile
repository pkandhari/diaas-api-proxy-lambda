pipeline {
    agent
    {
      dockerfile {
        args '-u root:root'
        filename 'Dockerfile'
        reuseNode true
      }
    }
    environment {
        REPO_NAME = 'diaas-api-proxy-lambda'
        SERVICE_NAME = 'api-proxy-lambda'
	  }
    stages {
        stage('Git') {
          steps {
            withCredentials([usernamePassword(credentialsId:"pdxc-jenkins", passwordVariable:"GIT_PASSWORD", usernameVariable:"GIT_USER")]) {
              sh "touch ~/.netrc"
              sh "echo 'machine github.dxc.com' >> ~/.netrc"
              sh "echo ' login ${GIT_USER}' >> ~/.netrc"
              sh "echo ' password ${GIT_PASSWORD}' >> ~/.netrc"
            }
          }
        }
         stage('Check repo name'){
            steps{
                script{
                    withCredentials([usernamePassword(credentialsId:"pdxc-jenkins", passwordVariable:"GIT_PASSWORD", usernameVariable:"GIT_USER")]) {
                        env.GIT_REPO_NAME = env.GIT_URL.replaceFirst(/^.*\/([^\/]+?).git$/, '$1')                          
                           
                        def check=checkRepoName(env.GIT_REPO_NAME,"${REPO_NAME}");
                        if (!check){
                            error "This pipeline stops here! Please check the environment variables"
                        } 
                    }
                }
            }
        }
        stage('Install') {
            steps {
                sh '''
                    cd code && npm --unsafe-perm --production install
                '''
            }
        }
        stage ('Zipping Artifact') {
            steps {
                sh '''
                    rm -rf proxy-lambda.zip
                '''
                zip zipFile: 'proxy-lambda.zip', archive: false, dir: './code'
            }
        }
        stage('Upload Artifact') {
            steps {
                withCredentials([usernamePassword(credentialsId:"diaas-rw", passwordVariable:"ARTIF_PASSWORD", usernameVariable:"ARTIF_USER")]) {
                  sh '''
                      curl -u${ARTIF_USER}:${ARTIF_PASSWORD} -T proxy-lambda.zip "https://artifactory.csc.com/artifactory/diaas-generic/${SERVICE_NAME}/${BRANCH_NAME}/${SERVICE_NAME}-bundle.${BUILD_ID}.zip"
                  '''
                }
            }
        }
        stage('Send email') {
            steps {
                // send to email
                emailext (
                    subject: "STARTED: Job '${env.JOB_NAME} [${env.BUILD_NUMBER}]'",
                    body: """<p>STARTED: Job '${env.JOB_NAME} [${env.BUILD_NUMBER}]':</p>
                      <p>Check console output at &QUOT;<a href='${env.BUILD_URL}'>${env.JOB_NAME} [${env.BUILD_NUMBER}]</a>&QUOT;</p>""",
                    recipientProviders: [[$class: 'DevelopersRecipientProvider']]
                  )
            }
        }
    }
}

Boolean checkRepoName(repoName, hardcodedRepoName){
    if (hardcodedRepoName == repoName){
        return true
    }
    return false
}
